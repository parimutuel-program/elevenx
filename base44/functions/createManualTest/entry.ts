import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Create a manual test match and bet with 30-minute betting window.
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
    const openUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    const settleAfter = new Date(now.getTime() + 6 * 60 * 1000); // 6 minutes from now

    // Create test match
    const match = await serviceRole.entities.Match.create({
      team_a: 'Test Team A',
      team_b: 'Test Team B',
      team_a_flag: '🇺🇸',
      team_b_flag: '🇧🇷',
      group_stage: 'Test Match',
      match_time: now.toISOString(),
      venue: 'Test Stadium',
      status: 'upcoming',
    });

    // Create test bet
    const bet = await serviceRole.entities.Bet.create({
      match_id: match.id,
      title: 'Test Team A vs Test Team B',
      outcome_a: 'Test Team A',
      outcome_b: 'Test Team B',
      open_until: openUntil.toISOString(),
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
      openUntil: openUntil.toISOString(),
      settleAfter: settleAfter.toISOString(),
      message: `Match created - betting closes in 30 minutes at ${openUntil.toLocaleString()}`
    });

  } catch (error) {
    console.error('createManualTest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});