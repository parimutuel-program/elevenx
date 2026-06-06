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

      // PARIMUTUEL LOGIC: LP wins when backed outcome LOSES (collects losing stakes)
      // Bettor (matcher) wins when backed outcome WINS
      const isLp = ub.role === 'lp';
      const backedWinner = ub.outcome === winning_outcome;
      
      if (isLp) {
        // LP: wins when backed outcome LOSES
        if (!backedWinner && ub.status === 'active') {
          // LP won - collect fees from losing bettors
          const feeEarnings = ub.liquidity_matched * 0.02; // 2% fee on matched portion
          await base44.entities.UserBet.update(ub.id, {
            status: 'won',
            actual_payout: feeEarnings,
          });
          winnersCount++;
        } else if (ub.status === 'active') {
          // LP lost - backed the winner, had to pay out
          await base44.entities.UserBet.update(ub.id, { status: 'lost', actual_payout: 0 });
        }
      } else {
        // Regular bettor (matcher): wins when backed outcome WINS
        if (backedWinner && ub.status === 'active') {
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
    }

    // Settle the Bet entity
    await base44.entities.Bet.update(bet_id, {
      status: 'settled',
      winning_outcome,
    });

    // ALSO settle on-chain by calling settleMarketOnChain
    console.log('[announceWinner] Calling settleMarketOnChain to update on-chain state...');
    try {
      const settleRes = await base44.functions.invoke('settleMarketOnChain', { bet_id, winning_outcome });
      if (settleRes.data?.error) {
        console.error('[announceWinner] settleMarketOnChain failed:', settleRes.data.error);
        // Don't fail the whole operation, just log it
      } else {
        console.log('[announceWinner] ✓ Market settled on-chain:', settleRes.data);
      }
    } catch (err) {
      console.error('[announceWinner] settleMarketOnChain threw:', err.message);
    }

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