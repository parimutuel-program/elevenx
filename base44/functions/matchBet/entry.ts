import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.95.3';

const SOLANA_PROGRAM_ID = 'ElevenX1111111111111111111111111111111111111';
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const walletAddress = user.wallet_address || user.data?.wallet_address;
    if (!walletAddress) {
      return Response.json({ error: 'Wallet not connected' }, { status: 400 });
    }

    const { offer_id, bet_id, match_id, amount } = await req.json();

    if (!offer_id || !bet_id || !match_id || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (amount <= 0) {
      return Response.json({ error: 'Amount must be positive' }, { status: 400 });
    }

    const offers = await base44.entities.BetOffer.filter({ id: offer_id });
    const offer = offers[0];

    if (!offer) {
      return Response.json({ error: 'Offer not found' }, { status: 404 });
    }

    if (offer.status !== 'open' && offer.status !== 'partially_matched') {
      return Response.json({ error: 'Offer is not available' }, { status: 400 });
    }

    if (amount > offer.amount_unmatched) {
      return Response.json({ error: 'Amount exceeds available liquidity' }, { status: 400 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];

    if (!bet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    if (bet.status !== 'open') {
      return Response.json({ error: 'Bet is not open' }, { status: 400 });
    }

    const matcherOutcome = offer.outcome === 'a' ? 'b' : offer.outcome === 'b' ? 'a' : 'a';
    const matcherLabel = matcherOutcome === 'a' ? bet.outcome_a : bet.outcome_b;

    const avA = bet.lp_amount_a || 0;
    const avB = bet.lp_amount_b || 0;
    const avDraw = bet.lp_amount_draw || 0;
    
    let currentOdds = 0;
    if (matcherOutcome === 'a') {
      currentOdds = avA > 0 ? (avB + avDraw) / avA : 0;
    } else if (matcherOutcome === 'b') {
      currentOdds = avB > 0 ? (avA + avDraw) / avB : 0;
    } else {
      currentOdds = avDraw > 0 ? (avA + avB) / avDraw : 0;
    }

    const FEE_BPS = 0; // 0% fee - fully decentralized
    const winnings = amount * currentOdds;
    const fee = winnings * FEE_BPS / 10000;
    const potentialPayout = amount + winnings - fee;

    // Prepare Solana instruction
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const matcherPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bet_pool'), Buffer.from(bet_id)],
      programId
    );

    const [existingPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), new PublicKey(offer.created_by_id).toBuffer(), Buffer.from(bet_id)],
      programId
    );

    const [matcherPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), matcherPubkey.toBuffer(), Buffer.from(bet_id)],
      programId
    );

    const data = Buffer.from([2, matcherOutcome === 'a' ? 0 : matcherOutcome === 'b' ? 1 : 2]); // MatchBet + outcome

    const keys = [
      { pubkey: betPoolPda, isSigner: false, isWritable: true },
      { pubkey: existingPositionPda, isSigner: false, isWritable: true },
      { pubkey: matcherPositionPda, isSigner: false, isWritable: true },
      { pubkey: matcherPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const newMatched = (offer.amount_matched || 0) + amount;
    const newUnmatched = offer.amount_offered - newMatched;
    const newStatus = newUnmatched <= 0.01 ? 'fully_matched' : 'partially_matched';
    
    await base44.entities.BetOffer.update(offer_id, {
      amount_matched: newMatched,
      amount_unmatched: Math.max(0, newUnmatched),
      status: newStatus,
    });

    const match = await base44.entities.Match.list().then(ms => ms.find(m => m.id === match_id));
    const userBet = await base44.entities.UserBet.create({
      bet_id,
      match_id,
      offer_id,
      outcome: matcherOutcome,
      amount,
      role: 'matcher',
      status: 'active',
      outcome_label: matcherLabel,
      match_title: `${match.team_a} vs ${match.team_b}`,
      potential_payout: potentialPayout,
      solana_position_pda: matcherPositionPda.toBase58(),
    });

    const lpBets = await base44.entities.UserBet.filter({ offer_id, role: 'lp' });
    if (lpBets.length > 0) {
      const lpWin = amount;
      const lpFee = lpWin * FEE_BPS / 10000;
      const lpPayout = offer.amount_offered + lpWin - lpFee;
      await base44.entities.UserBet.update(lpBets[0].id, {
        status: 'active',
        potential_payout: lpPayout,
      });
    }

    const backedField = matcherOutcome === 'a' ? 'backed_amount_a' : matcherOutcome === 'b' ? 'backed_amount_b' : 'backed_amount_draw';
    await base44.entities.Bet.update(bet_id, {
      [backedField]: (bet[backedField] || 0) + amount,
      total_pool: (bet.total_pool || 0) + amount,
      total_bettors: (bet.total_bettors || 0) + 1,
    });

    return Response.json({
      success: true,
      userBet,
      potentialPayout,
      solana_instruction: {
        programId: programId.toBase58(),
        keys,
        data: data.toString('hex'),
        matcherPositionPda: matcherPositionPda.toBase58(),
        amountLamports: amount * 1_000_000_000,
      },
      message: 'Bet matched - sign transaction on frontend to complete on-chain'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});