import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ODDS_API_KEY = Deno.env.get('THE_ODDS_API_KEY');
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

/**
 * LEGACY: Off-chain settlement (database only).
 * For on-chain settlement, use: settleFuturesMarketOnChain + commitFuturesSettlement
 * 
 * This function is kept for backwards compatibility but should not be used for new settlements.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { futures_market_id } = payload;

    if (!futures_market_id) {
      return Response.json({ error: 'Missing futures_market_id' }, { status: 400 });
    }

    console.warn('⚠️ settleFuturesWithOracle is deprecated. Use settleFuturesMarketOnChain for on-chain settlement.');

    // Get futures market
    const futuresMarkets = await base44.entities.FuturesMarket.filter({ id: futures_market_id });
    const futuresMarket = futuresMarkets[0];
    
    if (!futuresMarket) {
      return Response.json({ error: 'Futures market not found' }, { status: 404 });
    }

    if (futuresMarket.status === 'settled') {
      return Response.json({ error: 'Futures market already settled' }, { status: 400 });
    }

    // For legacy compatibility, allow manual position without on-chain verification
    const { manual_winning_position } = payload;
    
    if (!manual_winning_position || !['1st', '2nd', '3rd'].includes(manual_winning_position)) {
      return Response.json({ 
        error: 'This function is deprecated. Use settleFuturesMarketOnChain with manual position selection.',
      }, { status: 400 });
    }

    // Get all user bets for this futures market
    const userBets = await base44.entities.UserBet.filter({ 
      bet_id: futures_market_id 
    });

    let winnersCount = 0;
    let totalPayout = 0;
    let pendingCount = 0;
    let losersCount = 0;

    // Process each user bet
    for (const ub of userBets) {
      if (ub.status === 'pending') {
        await base44.entities.UserBet.update(ub.id, { 
          status: 'refunded', 
          actual_payout: 0 
        });
        pendingCount++;
        continue;
      }

      const outcomeIndex = ub.outcome === 'a' ? 0 : ub.outcome === 'b' ? 1 : 2;
      const userPosition = futuresMarket.outcomes[outcomeIndex]?.position;

      if (userPosition === manual_winning_position && ub.status === 'active') {
        const payout = ub.potential_payout || 0;
        await base44.entities.UserBet.update(ub.id, {
          status: 'won',
          actual_payout: payout,
        });
        totalPayout += payout;
        winnersCount++;
      } else if (ub.status === 'active') {
        await base44.entities.UserBet.update(ub.id, { 
          status: 'lost', 
          actual_payout: 0 
        });
        losersCount++;
      }
    }

    await base44.entities.FuturesMarket.update(futures_market_id, {
      status: 'settled',
    });

    console.log(
      `✓ Futures market ${futures_market_id} settled (OFF-CHAIN). Winner: ${manual_winning_position}, ` +
      `Winners: ${winnersCount}, Losers: ${losersCount}, Pending refunds: ${pendingCount}, Total payout: ◎${totalPayout.toFixed(4)}`
    );

    return Response.json({
      success: true,
      futures_market_id,
      winning_position: manual_winning_position,
      winners_count: winnersCount,
      losers_count: losersCount,
      pending_refunds: pendingCount,
      total_payout: totalPayout,
      source: 'legacy_off_chain',
      message: `Settled (OFF-CHAIN): ${winnersCount} winners | ◎${totalPayout.toFixed(4)} to pay out`,
      warning: 'This was an off-chain settlement. Use settleFuturesMarketOnChain for on-chain settlement.',
    });

  } catch (error) {
    console.error('settleFuturesWithOracle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});