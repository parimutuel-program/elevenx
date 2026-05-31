import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admin can settle bets
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { matchId, result } = await req.json();

    if (!matchId || !result) {
      return Response.json({ error: 'Missing matchId or result' }, { status: 400 });
    }

    // result should be: 'team_a', 'team_b', or 'draw'

    // Update the match
    await base44.entities.Match.update(matchId, {
      status: 'finished',
      winner: result,
    });

    // Get all bets for this match
    const bets = await base44.entities.Bet.filter({ match_id: matchId });

    for (const bet of bets) {
      // Determine winning outcome
      let winningOutcome = '';
      if (result === 'team_a') winningOutcome = 'a';
      else if (result === 'team_b') winningOutcome = 'b';
      else winningOutcome = 'draw';

      // Update bet status
      await base44.entities.Bet.update(bet.id, {
        status: 'settled',
        winning_outcome: winningOutcome,
      });

      // Get all user bets for this bet
      const userBets = await base44.entities.UserBet.filter({ bet_id: bet.id });

      for (const ub of userBets) {
        if (ub.status !== 'active') continue;

        if (ub.outcome === winningOutcome) {
          // User won
          await base44.entities.UserBet.update(ub.id, {
            status: 'won',
            actual_payout: ub.potential_payout,
          });
        } else {
          // User lost
          await base44.entities.UserBet.update(ub.id, {
            status: 'lost',
            actual_payout: 0,
          });
        }
      }
    }

    // Determine winning outcome code
    let winningOutcome = '';
    if (result === 'team_a') winningOutcome = 'a';
    else if (result === 'team_b') winningOutcome = 'b';
    else winningOutcome = 'draw';

    // Settle all bets for this match
    for (const bet of bets) {
      await base44.entities.Bet.update(bet.id, {
        status: 'settled',
        winning_outcome: winningOutcome,
      });

      // Update user bets
      const userBets = await base44.entities.UserBet.filter({ bet_id: bet.id });
      for (const ub of userBets) {
        if (ub.status !== 'active') continue;

        if (ub.outcome === winningOutcome) {
          await base44.entities.UserBet.update(ub.id, {
            status: 'won',
            actual_payout: ub.potential_payout,
          });
        } else {
          await base44.entities.UserBet.update(ub.id, {
            status: 'lost',
            actual_payout: 0,
          });
        }
      }
    }

    // TODO: In production, integrate with oracle provider
    // const oracleResult = await base44.functions.invoke('oracleService', { matchId, provider: 'pyth' });
    // Verify oracle signature and auto-settle

    return Response.json({
      success: true,
      message: `Bet settled successfully. Winner: ${result}`,
      oracleReady: false, // Set to true when oracle integration is complete
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});