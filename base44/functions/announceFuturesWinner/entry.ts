import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { futures_market_id, winning_position } = payload;

    // Validate parameters
    if (!futures_market_id || !winning_position || !['1st', '2nd', '3rd'].includes(winning_position)) {
      return Response.json({ 
        error: 'Invalid parameters. winning_position must be "1st", "2nd", or "3rd"' 
      }, { status: 400 });
    }

    // Get futures market
    const futuresMarkets = await base44.entities.FuturesMarket.filter({ id: futures_market_id });
    const futuresMarket = futuresMarkets[0];
    
    if (!futuresMarket) {
      return Response.json({ error: 'Futures market not found' }, { status: 404 });
    }

    if (futuresMarket.status === 'settled') {
      return Response.json({ error: 'Futures market already settled' }, { status: 400 });
    }

    // Get all user bets for this futures market
    const userBets = await base44.entities.UserBet.filter({ 
      bet_id: futures_market_id 
    });

    let winnersCount = 0;
    let totalPayout = 0;
    let pendingCount = 0;

    // Process each user bet
    for (const ub of userBets) {
      if (ub.status === 'pending') {
        // Pending = unmatched LP — refund the stake
        await base44.entities.UserBet.update(ub.id, { 
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
        await base44.entities.UserBet.update(ub.id, {
          status: 'won',
          actual_payout: payout,
        });
        totalPayout += payout;
        winnersCount++;
      } else if (ub.status === 'active') {
        // Loser
        await base44.entities.UserBet.update(ub.id, { 
          status: 'lost', 
          actual_payout: 0 
        });
      }
    }

    // Update futures market status
    await base44.entities.FuturesMarket.update(futures_market_id, {
      status: 'settled',
    });

    console.log(
      `✓ Futures market ${futures_market_id} settled. Winner: ${winning_position}, ` +
      `Winners: ${winnersCount}, Pending refunds: ${pendingCount}, Total payout: ◎${totalPayout.toFixed(4)}`
    );

    return Response.json({
      success: true,
      futures_market_id,
      winning_position,
      winners_count: winnersCount,
      pending_refunds: pendingCount,
      total_payout: totalPayout,
      message: `Settled: ${winnersCount} winners | ◎${totalPayout.toFixed(4)} to pay out | ${pendingCount} refunds`,
    });

  } catch (error) {
    console.error('announceFuturesWinner error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});