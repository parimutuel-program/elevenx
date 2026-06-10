import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Creates a test match starting now, ending in 30 minutes.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
    const bettingCloseTime = endTime; // Betting closes at match end

    // Create match
    const match = await base44.entities.Match.create({
      team_a: 'Test Team A',
      team_b: 'Test Team B',
      team_a_flag: '🏠',
      team_b_flag: '✈️',
      group_stage: 'Test Match',
      match_time: now.toISOString(),
      match_end_time: endTime.toISOString(),
      venue: 'Test Stadium',
      status: 'upcoming',
    });

    // Create bet
    const bet = await base44.entities.Bet.create({
      match_id: match.id,
      title: '30-Minute Test Match',
      outcome_a: 'Team A',
      outcome_b: 'Team B',
      outcome_draw: 'Draw',
      open_until: bettingCloseTime.toISOString(),
      status: 'open',
      odds_a: 2.0,
      odds_b: 2.0,
      odds_draw: 3.0,
      odds_bookmaker: 'Test',
      odds_updated_at: now.toISOString(),
      fee_percent: 200, // 2%
    });

    return Response.json({
      success: true,
      message: '✓ 30-minute test match created! Go to /admin → Matches to initialize on-chain.',
      testData: {
        matchId: match.id,
        betId: bet.id,
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
        bettingCloseTime: bettingCloseTime.toISOString(),
        timeUntilEnd: '30 minutes',
      },
      nextSteps: {
        step1: 'Go to /admin → Matches tab',
        step2: 'Find "30-Minute Test Match" and click "Initialize Market"',
        step3: 'Sign the transaction in your wallet',
        step4: 'Once initialized, you can provide liquidity or place bets',
      },
    });

  } catch (error) {
    console.error('createTestMatch30min error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});