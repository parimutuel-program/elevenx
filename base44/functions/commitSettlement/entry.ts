import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection } from 'npm:@solana/web3.js@1.98.4';

/**
 * Commit settlement results to database AFTER admin transaction succeeds on-chain.
 * Updates Bet status and UserBet statuses to 'won'/'lost' so players can claim.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const { signature, commit_data } = payload;
    
    if (!signature || !commit_data) {
      return Response.json({ error: 'Missing signature or commit_data' }, { status: 400 });
    }
    
    // Verify transaction actually succeeded on-chain
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const confirmation = await connection.getSignatureStatus(signature);
    
    if (!confirmation || !confirmation.value || confirmation.value.err) {
      console.error('[commitSettlement] Transaction failed on-chain:', confirmation);
      return Response.json({ 
        error: 'Transaction not confirmed on-chain',
        debug: confirmation,
      }, { status: 400 });
    }
    
    console.log('[commitSettlement] ✓ Transaction verified on-chain:', signature);
    
    const { bet_id, match_id, winning_outcome, outcome_label, all_bet_ids } = commit_data;
    
    // Update Bet status
    await serviceRole.entities.Bet.update(bet_id, {
      status: 'settled',
      winning_outcome: winning_outcome,
    });
    console.log('[commitSettlement] Updated Bet status to settled');
    
    // Update all UserBets for this match
    const allUserBets = await serviceRole.entities.UserBet.filter({ match_id });
    console.log('[commitSettlement] Found', allUserBets.length, 'UserBets to update');
    
    let wonCount = 0;
    let lostCount = 0;
    
    for (const userBet of allUserBets) {
      if (userBet.status !== 'active') {
        continue; // Skip already processed bets
      }
      
      const isWinner = userBet.outcome === winning_outcome;
      
      await serviceRole.entities.UserBet.update(userBet.id, {
        status: isWinner ? 'won' : 'lost',
        actual_payout: isWinner ? (userBet.potential_payout || 0) : 0,
      });
      
      if (isWinner) {
        wonCount++;
      } else {
        lostCount++;
      }
    }
    
    console.log('[commitSettlement] Updated UserBets:', { won: wonCount, lost: lostCount });
    
    // Update Match status if needed
    const match = await serviceRole.entities.Match.get(match_id);
    if (match && match.status !== 'finished') {
      await serviceRole.entities.Match.update(match_id, {
        status: 'finished',
        winner: winning_outcome === 'a' ? 'team_a' : winning_outcome === 'b' ? 'team_b' : 'draw',
      });
    }
    
    return Response.json({
      success: true,
      message: `✓ Market settled! ${wonCount} winners can now claim winnings`,
      wonCount,
      lostCount,
    });
    
  } catch (error) {
    console.error('[commitSettlement] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});