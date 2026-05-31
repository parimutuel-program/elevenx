import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    console.log(`✓ Bet ${bet_id} settled. Winner: ${winning_outcome}, Winners: ${winnersCount}, Total distributed: ${totalDistributed}`);

    return Response.json({
      success: true,
      bet_id,
      winning_outcome,
      winners_count: winnersCount,
      total_distributed: totalDistributed,
      message: `Bet settled. ${winnersCount} winners will receive ◎${totalDistributed.toFixed(2)}`
    });

  } catch (error) {
    console.error('announceWinner error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});