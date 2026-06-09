import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Create a quick test match that starts in 10 minutes and ends in 30 minutes.
 * Betting window closes in 30 minutes.
 * Admin only function.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only - admin role required' }, { status: 403 });
    }

    const now = new Date();
    const startTime = new Date(now.getTime()); // Starts NOW
    const endTime = new Date(now.getTime() + 5 * 60 * 1000); // Ends in 5 minutes
    const bettingCloseTime = new Date(now.getTime() + 5 * 60 * 1000); // Betting closes in 5 minutes

    console.log('[createQuickTestMatch] Creating test match with timestamps:', {
      now: now.toISOString(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      bettingCloseTime: bettingCloseTime.toISOString(),
    });

    // Step 1: Create test match
    const testMatch = await serviceRole.entities.Match.create({
      team_a: 'Quick Test A',
      team_b: 'Quick Test B',
      team_a_flag: '🇺🇸',
      team_b_flag: '🇧🇷',
      group_stage: 'Quick Test',
      match_time: startTime.toISOString(),
      match_end_time: endTime.toISOString(),
      venue: 'Test Stadium',
      status: 'upcoming',
    });

    console.log('[createQuickTestMatch] Created test match:', testMatch.id);

    // Step 2: Create bet market
    const testBet = await serviceRole.entities.Bet.create({
      match_id: testMatch.id,
      title: 'Quick Test - Winner',
      outcome_a: 'Quick Test A',
      outcome_b: 'Quick Test B',
      outcome_draw: 'Draw',
      open_until: bettingCloseTime.toISOString(),
      status: 'open',
      odds_a: 2.0,
      odds_b: 2.0,
      odds_draw: 3.0,
      odds_bookmaker: 'Quick Test',
      odds_updated_at: now.toISOString(),
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      total_pool: 0,
      fee_percent: 500, // 5% in basis points
      total_bettors: 0,
    });

    console.log('[createQuickTestMatch] Created test bet:', testBet.id);

    // Step 3: Initialize market on-chain
    try {
      const initResult = await base44.functions.invoke('createMarketOnChain', {
        bet_id: testBet.id,
        match_id: testMatch.id,
      });
      console.log('[createQuickTestMatch] Market initialized on-chain:', initResult.data);
    } catch (initErr) {
      console.error('[createQuickTestMatch] Failed to initialize on-chain:', initErr.message);
      // Don't fail the whole flow - user can manually initialize
    }

    return Response.json({
      success: true,
      message: '✓ Quick test match created! Starts now, ends in 5 minutes.',
      testData: {
        matchId: testMatch.id,
        betId: testBet.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        bettingCloseTime: bettingCloseTime.toISOString(),
        timeUntilStart: '0 minutes',
        timeUntilEnd: '5 minutes',
        timeUntilBettingClose: '5 minutes',
      },
      nextSteps: {
        step1: 'Go to /lp to provide liquidity',
        step2: 'Go to /matches to place bets',
        step3: 'Wait 5 minutes, then settle as Draw in /admin',
      },
    });

  } catch (error) {
    console.error('[createQuickTestMatch] Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});