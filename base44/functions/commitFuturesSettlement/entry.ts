import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Commit futures settlement to database after successful on-chain transaction.
 * Updates UserBet statuses and marks FuturesMarket as settled.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const { signature, futures_market_id, winning_position } = await req.json();
    
    if (!signature || !futures_market_id || !winning_position) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Get futures market
    const futuresMarket = await serviceRole.entities.FuturesMarket.get(futures_market_id);
    if (!futuresMarket) {
      return Response.json({ error: 'Futures market not found' }, { status: 404 });
    }
    
    if (futuresMarket.status === 'settled') {
      return Response.json({ error: 'Futures market already settled' }, { status: 400 });
    }
    
    // Get all user bets for this futures market
    const userBets = await serviceRole.entities.UserBet.filter({ 
      bet_id: futures_market_id 
    });
    
    let winnersCount = 0;
    let losersCount = 0;
    let pendingCount = 0;
    let totalPayout = 0;
    
    // Process each user bet
    for (const ub of userBets) {
      if (ub.status === 'pending') {
        // Pending = unmatched LP — refund the stake
        await serviceRole.entities.UserBet.update(ub.id, { 
          status: 'refunded', 
          actual_payout: 0 
        });
        pendingCount++;
        continue;
      }
      
      // Check if user bet on the winning position
      const outcomeIndex = ub.outcome === 'a' ? 0 : ub.outcome === 'b' ? 1 : 2;
      const userPosition = futuresMarket.outcomes[outcomeIndex]?.position;
      
      if (userPosition === winning_position && ub.status === 'active') {
        // Winner — payout based on fixed odds
        const payout = ub.potential_payout || 0;
        await serviceRole.entities.UserBet.update(ub.id, {
          status: 'won',
          actual_payout: payout,
        });
        totalPayout += payout;
        winnersCount++;
      } else if (ub.status === 'active') {
        // Loser
        await serviceRole.entities.UserBet.update(ub.id, { 
          status: 'lost', 
          actual_payout: 0 
        });
        losersCount++;
      }
    }
    
    // Update futures market status
    await serviceRole.entities.FuturesMarket.update(futures_market_id, {
      status: 'settled',
    });
    
    console.log(
      `✓ Futures market ${futures_market_id} settled on-chain. Winner: ${winning_position}, ` +
      `Winners: ${winnersCount}, Losers: ${losersCount}, Pending refunds: ${pendingCount}, Total payout: ◎${totalPayout.toFixed(4)}`
    );
    
    return Response.json({
      success: true,
      futures_market_id,
      winning_position,
      winners_count: winnersCount,
      losers_count: losersCount,
      pending_refunds: pendingCount,
      total_payout: totalPayout,
      message: `Settled: ${winnersCount} winners | ◎${totalPayout.toFixed(4)} to pay out | ${pendingCount} refunds`,
    });
    
  } catch (error) {
    console.error('commitFuturesSettlement error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});