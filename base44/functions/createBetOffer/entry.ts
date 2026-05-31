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

    if (!user.wallet_address) {
      return Response.json({ error: 'Wallet not connected' }, { status: 400 });
    }

    const { bet_id, match_id, outcome, amount } = await req.json();

    if (!bet_id || !match_id || !outcome || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (amount <= 0) {
      return Response.json({ error: 'Amount must be positive' }, { status: 400 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];

    if (!bet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    if (bet.status !== 'open') {
      return Response.json({ error: 'Bet is not open' }, { status: 400 });
    }

    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

    // Prepare Solana instruction data
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const userPubkey = new PublicKey(user.wallet_address);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bet_pool'), Buffer.from(bet_id)],
      programId
    );

    const [userPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), userPubkey.toBuffer(), Buffer.from(bet_id)],
      programId
    );

    const outcomeEnum = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const data = Buffer.from([0, outcomeEnum]); // CreateBetOffer + outcome

    const keys = [
      { pubkey: betPoolPda, isSigner: false, isWritable: true },
      { pubkey: userPositionPda, isSigner: false, isWritable: true },
      { pubkey: userPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const offer = await base44.entities.BetOffer.create({
      bet_id,
      match_id,
      outcome,
      outcome_label: outcomeLabel,
      amount_offered: amount,
      amount_matched: 0,
      amount_unmatched: amount,
      status: 'open',
      odds_at_creation: 0,
      solana_bet_pool_pda: betPoolPda.toBase58(),
      solana_position_pda: userPositionPda.toBase58(),
    });

    const lpField = outcome === 'a' ? 'lp_amount_a' : outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
    await base44.entities.Bet.update(bet_id, {
      [lpField]: (bet[lpField] || 0) + amount,
    });

    const match = await base44.entities.Match.list().then(ms => ms.find(m => m.id === match_id));
    await base44.entities.UserBet.create({
      bet_id,
      match_id,
      offer_id: offer.id,
      outcome,
      amount,
      role: 'lp',
      status: 'pending',
      outcome_label: outcomeLabel,
      match_title: `${match.team_a} vs ${match.team_b}`,
      potential_payout: 0,
      solana_position_pda: userPositionPda.toBase58(),
    });

    return Response.json({
      success: true,
      offer,
      solana_instruction: {
        programId: programId.toBase58(),
        keys,
        data: data.toString('hex'),
        betPoolPda: betPoolPda.toBase58(),
        userPositionPda: userPositionPda.toBase58(),
        amountLamports: amount * 1_000_000_000,
      },
      message: 'Bet offer created - sign transaction on frontend to complete on-chain'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});