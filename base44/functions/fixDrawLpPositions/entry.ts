import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Fix LP positions that were incorrectly marked as 'won' for DRAW outcomes.
 * Sets them to 'lost' status so house keeps the funds (as per parimutuel rules).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Get all settled bets with draw outcome
    const allBets = await serviceRole.entities.Bet.list();
    const drawBets = allBets.filter(b => b.winning_outcome === 'draw');
    
    if (drawBets.length === 0) {
      return Response.json({ 
        success: true,
        message: 'No draw bets found',
        fixed: 0,
      });
    }
    
    console.log('[fixDrawLpPositions] Found', drawBets.length, 'draw bets');
    
    let fixedCount = 0;
    let totalRecovered = 0;
    
    // Fix all LP positions in draw bets
    for (const drawBet of drawBets) {
      const userBets = await serviceRole.entities.UserBet.filter({ bet_id: drawBet.id });
      
      for (const userBet of userBets) {
        if (userBet.role !== 'lp') continue;
        if (userBet.status !== 'won') continue; // Only fix incorrectly won LPs
        
        // Update LP status to 'lost'
        await serviceRole.entities.UserBet.update(userBet.id, {
          status: 'lost',
          actual_payout: 0,
        });
        
        const matchedAmount = userBet.liquidity_matched || userBet.amount || 0;
        totalRecovered += matchedAmount;
        fixedCount++;
        
        console.log('[fixDrawLpPositions] Fixed LP:', {
          userBetId: userBet.id,
          bet_id: drawBet.id,
          outcome: userBet.outcome,
          matchedAmount,
          oldStatus: 'won',
          newStatus: 'lost',
        });
      }
    }
    
    console.log('[fixDrawLpPositions] Summary:', {
      fixed: fixedCount,
      totalRecovered,
    });
    
    return Response.json({
      success: true,
      message: `✓ Fixed ${fixedCount} LP positions. House recovered ◎${totalRecovered.toFixed(4)} SOL`,
      fixed: fixedCount,
      totalRecovered,
    });
    
  } catch (error) {
    console.error('[fixDrawLpPositions] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});