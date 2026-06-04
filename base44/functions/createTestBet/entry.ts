import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    // Create test match (Flow1 vs Flow2)
    const matchTime = new Date('2026-06-04T19:25:00Z'); // 1:25 PM Costa Rica
    const matchEndTime = new Date('2026-06-04T19:40:00Z'); // 1:40 PM Costa Rica
    
    const match = await base44.entities.Match.create({
      team_a: 'Flow1',
      team_b: 'Flow2',
      team_a_flag: '🇺🇸',
      team_b_flag: '🇪🇺',
      group_stage: 'Test Match',
      match_time: matchTime.toISOString(),
      match_end_time: matchEndTime.toISOString(),
      venue: 'Test Arena',
      status: 'upcoming',
    });

    // Create test bet
    const bet = await base44.entities.Bet.create({
      match_id: match.id,
      title: 'Flow1 vs Flow2 - Test Bet',
      outcome_a: 'Flow1',
      outcome_b: 'Flow2',
      outcome_draw: 'Draw',
      open_until: matchEndTime.toISOString(),
      status: 'open',
      odds_a: 2.0,
      odds_b: 2.0,
      odds_draw: 3.0,
      odds_bookmaker: 'Test',
      odds_updated_at: new Date().toISOString(),
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      total_pool: 0,
      fee_percent: 0,
      total_bettors: 0,
      solana_market_created: false,
    });

    return Response.json({ 
      success: true, 
      message: 'Test bet created successfully',
      match_id: match.id,
      bet_id: bet.id,
      match_time: matchTime.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }),
      match_end_time: matchEndTime.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }),
    });
  } catch (error) {
    console.error('[createTestBet] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});