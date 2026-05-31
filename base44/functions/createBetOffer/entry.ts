import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.95.3';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = '11111111111111111111111111111111'; // System program as placeholder until real program is deployed
const SOLANA_RPC_URL = 'https://api.devnet.solana.com'; // Using devnet for testing

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Get wallet address from request payload (passed by frontend for wallet-only auth)
    const payload = await req.json();
    const walletAddress = payload.walletAddress;
    
    if (!walletAddress) {
      return Response.json({ error: 'Please login first: Connect your wallet and register/login to place bets' }, { status: 401 });
    }

    // Verify user exists with this wallet address
    const users = await serviceRole.entities.User.filter({ wallet_address: walletAddress });
    if (!users || users.length === 0) {
      return Response.json({ error: 'Wallet not registered. Please connect your wallet first.' }, { status: 401 });
    }

    const user = users[0];

    const { bet_id, match_id, outcome, amount } = payload;

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

    // Prepare Solana instruction data - wrap in try-catch for detailed error
    let userPubkey, programId;
    try {
      userPubkey = new PublicKey(walletAddress);
      programId = new PublicKey(SOLANA_PROGRAM_ID);
    } catch (err) {
      return Response.json({ error: 'Invalid public key: ' + err.message, walletAddress, SOLANA_PROGRAM_ID }, { status: 400 });
    }
    
    // Convert bet_id to bytes for PDA (use first 32 bytes or pad with zeros)
    const betIdBytes = Buffer.from(bet_id, 'utf-8');
    const betIdPadded = Buffer.alloc(32);
    betIdBytes.copy(betIdPadded, 0, 0, Math.min(betIdBytes.length, 32));

    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bet_pool'), betIdPadded],
      programId
    );

    const [userPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), userPubkey.toBuffer(), betIdPadded],
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

    // Create offer but mark as pending until transaction is confirmed
    const offer = await base44.entities.BetOffer.create({
      bet_id,
      match_id,
      outcome,
      outcome_label: outcomeLabel,
      amount_offered: amount,
      amount_matched: 0,
      amount_unmatched: amount,
      status: 'pending', // Changed from 'open' - will update to 'open' after signing
      odds_at_creation: 0,
      lp_wallet_address: walletAddress,
      solana_bet_pool_pda: betPoolPda.toBase58(),
      solana_position_pda: userPositionPda.toBase58(),
    });

    const match = await base44.entities.Match.list().then(ms => ms.find(m => m.id === match_id));
    
    // Create UserBet in pending state - will update to 'active' after transaction confirms
    const userBet = await base44.entities.UserBet.create({
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
      offerId: offer.id,
      userBetId: userBet.id,
      solana_instruction: {
        betPoolPda: betPoolPda.toBase58(),
        userPositionPda: userPositionPda.toBase58(),
        amountLamports: Math.round(amount * 1_000_000_000),
      },
      message: 'Sign transaction to lock your SOL'
    });

  } catch (error) {
    console.error('createBetOffer error:', error);
    console.error('Stack:', error.stack);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});