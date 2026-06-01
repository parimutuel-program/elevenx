import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Settle a bet market after the match result is known.
 * Updates all UserBets — winners get fixed-odds payout, losers get nothing.
 * Pending (unmatched) stakes are flagged for refund.
 */
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
      return Response.json({ error: 'Invalid parameters. winning_outcome must be a, b, or draw' }, { status: 400 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });
    if (bet.status === 'settled') return Response.json({ error: 'Bet already settled' }, { status: 400 });

    const userBets = await base44.entities.UserBet.filter({ bet_id });

    let winnersCount = 0;
    let totalPayout  = 0;
    let pendingCount = 0;

    for (const ub of userBets) {
      if (ub.status === 'pending') {
        // Pending = unmatched — refund the stake
        await base44.entities.UserBet.update(ub.id, { status: 'refunded', actual_payout: 0 });
        pendingCount++;
        continue;
      }

      if (ub.outcome === winning_outcome && ub.status === 'active') {
        // Winner — payout is the fixed potential_payout locked at bet time
        const payout = ub.potential_payout || 0;
        await base44.entities.UserBet.update(ub.id, {
          status: 'won',
          actual_payout: payout,
        });
        totalPayout += payout;
        winnersCount++;
      } else if (ub.status === 'active') {
        // Loser
        await base44.entities.UserBet.update(ub.id, { status: 'lost', actual_payout: 0 });
      }
    }

    // Settle the Bet entity
    await base44.entities.Bet.update(bet_id, {
      status: 'settled',
      winning_outcome,
    });

    console.log(`✓ Bet ${bet_id} settled. Winner: ${winning_outcome}, Winners: ${winnersCount}, Pending refunds: ${pendingCount}, Total payout: ◎${totalPayout.toFixed(4)}`);

    return Response.json({
      success: true,
      bet_id,
      winning_outcome,
      winners_count: winnersCount,
      pending_refunds: pendingCount,
      total_payout: totalPayout,
      message: `Settled: ${winnersCount} winners | ◎${totalPayout.toFixed(4)} to pay out | ${pendingCount} refunds`,
    });

  } catch (error) {
    console.error('announceWinner error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});