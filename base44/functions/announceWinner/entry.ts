import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// IMPORTANT: Replace with your actual deployed program ID after deployment
// For now using a valid placeholder - update after deploying your program
const SOLANA_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'; // SPL Token Program (valid devnet program for testing)
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { bet_id, winning_outcome } = payload;

    if (!bet_id || !winning_outcome || !['a', 'b', 'draw'].includes(winning_outcome)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Get the bet
    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];

    if (!bet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    if (bet.status !== 'open' && bet.status !== 'closed') {
      return Response.json({ error: 'Bet is already settled' }, { status: 400 });
    }

    // Get all active user bets for this bet
    const userBets = await base44.entities.UserBet.filter({ bet_id });
    const activeBets = userBets.filter(ub => ub.status === 'active');

    let totalDistributed = 0;
    let winnersCount = 0;

    // Prepare Solana instruction for settle_bet
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Get bet pool PDA from first offer
    const offers = await base44.entities.BetOffer.filter({ bet_id });
    const betPoolPda = offers[0]?.solana_bet_pool_pda;
    
    if (!betPoolPda) {
      return Response.json({ error: 'Bet pool PDA not found' }, { status: 400 });
    }

    // Settle bet instruction data: [5, outcome_enum]
    // Outcome enum: A=0, B=1, Draw=2
    const outcomeEnum = winning_outcome === 'a' ? 0 : winning_outcome === 'b' ? 1 : 2;
    const settleData = Buffer.from([5, outcomeEnum]);

    const keys = [
      { pubkey: new PublicKey(betPoolPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(user.wallet_address), isSigner: true, isWritable: true }, // Admin signs
    ];

    // Process each bet
    for (const userBet of activeBets) {
      if (userBet.outcome === winning_outcome) {
        // Winner - update to 'won' status
        await base44.entities.UserBet.update(userBet.id, {
          status: 'won',
          actual_payout: userBet.potential_payout,
        });
        totalDistributed += userBet.potential_payout;
        winnersCount++;
      } else {
        // Loser - update to 'lost' status
        await base44.entities.UserBet.update(userBet.id, {
          status: 'lost',
          actual_payout: 0,
        });
      }
    }

    // Update the bet status
    await base44.entities.Bet.update(bet_id, {
      status: 'settled',
      winning_outcome,
    });

    console.log(`✓ Bet ${bet_id} settled. Winner: ${winning_outcome}, Winners: ${winnersCount}, Total distributed: ◎${totalDistributed.toFixed(2)}`);

    return Response.json({
      success: true,
      bet_id,
      winning_outcome,
      winners_count: winnersCount,
      total_distributed: totalDistributed,
      message: `Bet settled. ${winnersCount} winners will receive ◎${totalDistributed.toFixed(2)}`,
      solana_instruction: {
        instruction_type: 'settle_bet',
        betPoolPda,
        adminPubkey: user.wallet_address,
        winning_outcome: outcomeEnum,
      }
    });

  } catch (error) {
    console.error('announceWinner error:', error);
    console.error('Stack trace:', error.stack);
    console.error('Request details:', {
      hasAuth: !!req.headers.get('Authorization'),
      userId: await base44.auth.me().then(u => u?.id).catch(() => null),
    });
    return Response.json({ 
      error: error.message,
      details: error.toString(),
    }, { status: 500 });
  }
});