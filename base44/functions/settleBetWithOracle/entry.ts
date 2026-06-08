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

      // Get all user bets for this bet
      const userBets = await base44.entities.UserBet.filter({ bet_id: bet.id });

      // Check if there are any winners (winners_pool > 0)
      const hasWinners = userBets.some(ub => ub.outcome === winningOutcome && (ub.status === 'active' || ub.status === 'won'));

      // Update bet status - void if no winners, settled otherwise
      await base44.entities.Bet.update(bet.id, {
        status: hasWinners ? 'settled' : 'void',
        winning_outcome: hasWinners ? winningOutcome : '',
      });

      for (const ub of userBets) {
        if (ub.status !== 'active') continue;

        if (!hasWinners) {
          // No winners on the winning outcome (e.g., Draw won but no one bet on Draw)
          // CRITICAL: LPs LOSE their matched liquidity (it goes to DAO fee vault)
          // Only regular bettors get refunded
          if (ub.role === 'lp') {
            // LP loses - matched liquidity goes to DAO
            await base44.entities.UserBet.update(ub.id, {
              status: 'lost',
              actual_payout: 0,
            });
          } else {
            // Regular bettor gets refunded
            await base44.entities.UserBet.update(ub.id, {
              status: 'refunded',
              actual_payout: ub.amount,
            });
          }
        } else if (ub.role === 'lp') {
          // LP LOGIC: LP WINS when they backed a LOSER (outcome != winningOutcome)
          // LP LOSES when they backed the WINNER (outcome === winningOutcome)
          if (ub.outcome === winningOutcome) {
            // LP backed the winner → LP LOSES (pays out to bettors)
            await base44.entities.UserBet.update(ub.id, {
              status: 'lost',
              actual_payout: 0,
            });
          } else {
            // LP backed a loser → LP WINS (keeps bettors' stake + fees)
            await base44.entities.UserBet.update(ub.id, {
              status: 'won',
              actual_payout: ub.amount + (ub.liquidity_matched * 0.02 || 0), // stake + 2% fees
            });
          }
        } else {
          // Regular bettor logic
          if (ub.outcome === winningOutcome) {
            // Bettor won
            await base44.entities.UserBet.update(ub.id, {
              status: 'won',
              actual_payout: ub.potential_payout,
            });
          } else {
            // Bettor lost
            await base44.entities.UserBet.update(ub.id, {
              status: 'lost',
              actual_payout: 0,
            });
          }
        }
      }
    }

    // Oracle integration ready - call oracleService for production settlement
    // const oracleResult = await base44.functions.invoke('oracleService', { matchId, provider: 'pyth' });

    return Response.json({
      success: true,
      message: `Bet settled successfully. Winner: ${result}`,
      oracleReady: false, // Set to true when oracle integration is complete
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});