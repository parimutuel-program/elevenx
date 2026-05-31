import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.95.3';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = '11111111111111111111111111111111'; // System program as placeholder until real program is deployed
const SOLANA_RPC_URL = 'https://api.devnet.solana.com'; // Using devnet for testing

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let user;
    try {
      user = await base44.auth.me();
    } catch (err) {
      return Response.json({ error: 'Please login first: Connect your wallet and register/login to place bets' }, { status: 401 });
    }

    if (!user) {
      return Response.json({ error: 'Please login first: Connect your wallet and register/login to place bets' }, { status: 401 });
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

    if (offer.status !== 'open' && offer.status !== 'partially_matched' && offer.status !== 'pending') {
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
    
    // Convert bet_id to bytes for PDA (use first 32 bytes or pad with zeros)
    const betIdBytes = Buffer.from(bet_id, 'utf-8');
    const betIdPadded = Buffer.alloc(32);
    betIdBytes.copy(betIdPadded, 0, 0, Math.min(betIdBytes.length, 32));

    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bet_pool'), betIdPadded],
      programId
    );

    // Get the LP's wallet address from the offer
    const lpWalletAddress = offer.lp_wallet_address;
    if (!lpWalletAddress) {
      return Response.json({ error: 'LP wallet address not found in offer' }, { status: 400 });
    }
    const lpPubkey = new PublicKey(lpWalletAddress);

    const [existingPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), lpPubkey.toBuffer(), betIdPadded],
      programId
    );

    const [matcherPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), matcherPubkey.toBuffer(), betIdPadded],
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

    const match = await base44.entities.Match.list().then(ms => ms.find(m => m.id === match_id));
    
    // Create UserBet in pending state - will update after transaction confirms
    const userBet = await base44.entities.UserBet.create({
      bet_id,
      match_id,
      offer_id,
      outcome: matcherOutcome,
      amount,
      role: 'matcher',
      status: 'pending', // Changed from 'active' - will update after signing
      outcome_label: matcherLabel,
      match_title: `${match.team_a} vs ${match.team_b}`,
      potential_payout: potentialPayout,
      solana_position_pda: matcherPositionPda.toBase58(),
    });

    return Response.json({
      success: true,
      userBetId: userBet.id,
      offerId: offer_id,
      potentialPayout,
      solana_instruction: {
        betPoolPda: betPoolPda.toBase58(),
        userPositionPda: matcherPositionPda.toBase58(),
        amountLamports: Math.round(amount * 1_000_000_000),
      },
      message: 'Sign transaction to lock your SOL'
    });

  } catch (error) {
    console.error('matchBet error:', error);
    console.error('Stack:', error.stack);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});