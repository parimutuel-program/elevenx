import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Create a bulletproof test match with guaranteed valid timestamps.
 * Timeline:
 * - NOW: Current time
 * - Match starts: NOW + 10 minutes
 * - Betting closes: Match start + 60 minutes (1 hour AFTER kickoff)
 * - Settlement: Betting close + 5 minutes
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Verify admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date();
    const nowUnix = Math.floor(now.getTime() / 1000);
    
    // CRITICAL: All timestamps must be in the future for on-chain validation
    const matchStartTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 min from now
    const bettingClosesAt = new Date(matchStartTime.getTime() + 60 * 60 * 1000); // 60 min AFTER kickoff
    const settleAfter = new Date(bettingClosesAt.getTime() + 5 * 60 * 1000); // 5 min after betting closes
    
    // Validate timestamps (for debugging)
    console.log('Timeline:', {
      now_unix: nowUnix,
      match_start: Math.floor(matchStartTime.getTime() / 1000),
      betting_closes: Math.floor(bettingClosesAt.getTime() / 1000),
      settle_after: Math.floor(settleAfter.getTime() / 1000),
      betting_window_seconds: Math.floor((bettingClosesAt.getTime() - matchStartTime.getTime()) / 1000),
    });

    // Create test match
    const match = await serviceRole.entities.Match.create({
      team_a: 'Test A',
      team_b: 'Test B',
      team_a_flag: '🔵',
      team_b_flag: '🔴',
      group_stage: 'Quick Test',
      match_time: matchStartTime.toISOString(),
      match_end_time: settleAfter.toISOString(),
      venue: 'Test Arena',
      status: 'upcoming',
    });

    // Create test bet with VALID betting window (MUST be in future)
    const bet = await serviceRole.entities.Bet.create({
      match_id: match.id,
      title: 'Test A vs Test B',
      outcome_a: 'Test A',
      outcome_b: 'Test B',
      outcome_draw: 'Draw',
      open_until: bettingClosesAt.toISOString(), // MUST be > now
      status: 'open',
      odds_a: 2.0,
      odds_b: 2.0,
      odds_draw: 3.0,
      fee_percent: 0,
      solana_market_created: false,
    });

    return Response.json({ 
      success: true, 
      matchId: match.id,
      betId: bet.id,
      timeline: {
        now: now.toISOString(),
        match_starts: matchStartTime.toISOString(),
        betting_closes: bettingClosesAt.toISOString(),
        settlement: settleAfter.toISOString(),
      },
      message: `✓ MATCH CREATED!\n\n⏰ Timeline:\n- Match starts: ${Math.floor((matchStartTime.getTime() - now.getTime()) / 60000)} min\n- Betting closes: ${Math.floor((bettingClosesAt.getTime() - now.getTime()) / 60000)} min\n- Settlement: ${Math.floor((settleAfter.getTime() - now.getTime()) / 60000)} min\n\n✅ Go to Matches → Click "Initialize Market"`,
    });

  } catch (error) {
    console.error('createManualTest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});