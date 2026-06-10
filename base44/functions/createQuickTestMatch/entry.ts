import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const now = new Date();
    const matchTime = now;
    const matchEndTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    
    console.log('[createQuickTestMatch] Creating match:', {
      start: matchTime.toISOString(),
      end: matchEndTime.toISOString(),
    });
    
    // Create match
    const match = await serviceRole.entities.Match.create({
      team_a: 'Test Team A',
      team_b: 'Test Team B',
      team_a_flag: '🇺🇸',
      team_b_flag: '🇲🇽',
      group_stage: 'Test Match',
      match_time: matchTime.toISOString(),
      match_end_time: matchEndTime.toISOString(),
      venue: 'Test Stadium',
      status: 'upcoming',
      score_a: 0,
      score_b: 0,
      winner: '',
    });
    
    console.log('[createQuickTestMatch] Match created:', match.id);
    
    // Create bet
    const bet = await serviceRole.entities.Bet.create({
      match_id: match.id,
      title: 'Test Match - 5min Window',
      outcome_a: 'Test Team A',
      outcome_b: 'Test Team B',
      outcome_draw: 'Draw',
      open_until: matchEndTime.toISOString(),
      status: 'open',
      winning_outcome: '',
      odds_a: 2.0,
      odds_b: 2.0,
      odds_draw: 3.0,
      odds_bookmaker: 'Test',
      odds_updated_at: now.toISOString(),
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      total_pool: 0,
      fee_percent: 0,
      total_bettors: 0,
      solana_market_created: false,
      solana_market_pda: '',
    });
    
    console.log('[createQuickTestMatch] Bet created:', bet.id);
    
    return Response.json({
      success: true,
      message: 'Test match created with 5-minute betting window',
      match: {
        id: match.id,
        team_a: match.team_a,
        team_b: match.team_b,
        start: match.match_time,
        end: match.match_end_time,
      },
      bet: {
        id: bet.id,
        title: bet.title,
        open_until: bet.open_until,
      },
      instructions: {
        next: 'Go to Admin > Bets tab and click "⚡ Deploy" to create on-chain market',
      },
    });
    
  } catch (error) {
    console.error('[createQuickTestMatch] Error:', error);
    return Response.json({ 
      error: error.message,
    }, { status: 500 });
  }
});