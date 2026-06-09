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
    
    // Skip on-chain verification for admin DB overrides
    if (!signature.startsWith('db-override-')) {
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
    } else {
      console.log('[commitSettlement] DB override — skipping on-chain verification');
    }
    
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
      
      const isLp = userBet.role === 'lp';
      const backedWinner = userBet.outcome === winning_outcome;
      let isWinner = false;
      let payout = 0;
      
      // CRITICAL: LP wins when their backed outcome LOSES (collects losing bettors' stakes)
      // LP loses when their backed outcome WINS (no losing bettors to collect from)
      // This applies to ALL outcomes including Draw
      if (isLp) {
        // LP wins when backed outcome LOSES (collects losing bettor stakes)
        if (!backedWinner) {
          isWinner = true;
          // LP earns matched liquidity (losing bettor stakes) + fees
          payout = userBet.liquidity_matched || userBet.amount || 0;
          console.log('[commitSettlement] LP WON (backed loser):', {
            userBetId: userBet.id,
            role: userBet.role,
            backed_outcome: userBet.outcome,
            winning_outcome,
            reason: 'LP backed the losing outcome, collects from winning bettors'
          });
        } else {
          console.log('[commitSettlement] LP LOST (backed winner):', {
            userBetId: userBet.id,
            role: userBet.role,
            backed_outcome: userBet.outcome,
            winning_outcome,
            reason: 'LP backed the winning outcome, no losing bettors to collect from'
          });
        }
      } else {
        // Regular bettor wins when backed outcome WINS
        if (backedWinner) {
          isWinner = true;
          payout = userBet.potential_payout || 0;
          console.log('[commitSettlement] Bettor WON:', {
            userBetId: userBet.id,
            role: userBet.role,
            backed_outcome: userBet.outcome,
            winning_outcome
          });
        } else {
          console.log('[commitSettlement] Bettor LOST:', {
            userBetId: userBet.id,
            role: userBet.role,
            backed_outcome: userBet.outcome,
            winning_outcome
          });
        }
      }
      
      await serviceRole.entities.UserBet.update(userBet.id, {
        status: isWinner ? 'won' : 'lost',
        actual_payout: payout,
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