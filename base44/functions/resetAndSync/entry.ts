import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only function to completely reset all betting data and re-sync from API
// Deletes: UserBets, BetOffers, LpPositions, Bets, FuturesMarkets, Matches
// Then re-syncs fresh World Cup matches from TheStatsAPI with correct timestamps
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const STATS_API_KEY = Deno.env.get('THE_ODDS_API_KEY'); // Using THE_ODDS_API_KEY for TheStatsAPI
    const ODDS_API_KEY = Deno.env.get('THE_ODDS_API_KEY');
    
    if (!STATS_API_KEY) {
      return Response.json({ error: 'THE_ODDS_API_KEY not set' }, { status: 500 });
    }

    console.log('[resetAndSync] Starting complete database reset...');

    // Step 1: Delete all user-facing data (in order of dependencies)
    // First fetch all records, then delete them one by one (bulk delete with empty filter doesn't work)
    console.log('[resetAndSync] Fetching and deleting UserBets...');
    const userBets = await base44.asServiceRole.entities.UserBet.list();
    for (const ub of userBets) await base44.asServiceRole.entities.UserBet.delete(ub.id);
    
    console.log('[resetAndSync] Fetching and deleting BetOffers...');
    const betOffers = await base44.asServiceRole.entities.BetOffer.list();
    for (const bo of betOffers) await base44.asServiceRole.entities.BetOffer.delete(bo.id);
    
    console.log('[resetAndSync] Fetching and deleting LpPositions...');
    const lpPositions = await base44.asServiceRole.entities.LpPosition.list();
    for (const lp of lpPositions) await base44.asServiceRole.entities.LpPosition.delete(lp.id);
    
    console.log('[resetAndSync] Fetching and deleting Bets...');
    const bets = await base44.asServiceRole.entities.Bet.list();
    for (const bet of bets) await base44.asServiceRole.entities.Bet.delete(bet.id);
    
    console.log('[resetAndSync] Fetching and deleting FuturesMarkets...');
    const futures = await base44.asServiceRole.entities.FuturesMarket.list();
    for (const fm of futures) await base44.asServiceRole.entities.FuturesMarket.delete(fm.id);
    
    console.log('[resetAndSync] Fetching and deleting Matches...');
    const matches = await base44.asServiceRole.entities.Match.list();
    for (const m of matches) await base44.asServiceRole.entities.Match.delete(m.id);

    // Step 2: Fetch fresh World Cup 2026 matches from API
    console.log('[resetAndSync] Fetching fresh matches from TheStatsAPI...');
    const WC_COMPETITION_ID = 'comp_6107';
    const WC_SEASON_ID = 'sn_118868';
    
    // Retry logic for rate limits
    let res;
    let retries = 3;
    while (retries > 0) {
      res = await fetch(
        `https://api.thestatsapi.com/api/football/matches?competition_id=${WC_COMPETITION_ID}&per_page=100&page=1`,
        { headers: { Authorization: `Bearer ${STATS_API_KEY}` } }
      );
      
      if (res.status === 429) {
        retries--;
        if (retries === 0) {
          return Response.json({ 
            error: 'TheStatsAPI rate limit exceeded. Please wait a few minutes and try again.',
            status_code: 429
          }, { status: 429 });
        }
        console.log(`[resetAndSync] Rate limited, waiting 2 seconds... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }
    
    if (!res.ok) {
      if (res.status === 403) {
        return Response.json({ 
          error: 'THE_ODDS_API_KEY has no active subscription plan. Please activate your API key.',
          status_code: 403
        }, { status: 503 });
      }
      const text = await res.text();
      return Response.json({ error: `API error ${res.status}: ${text}` }, { status: 500 });
    }
    
    const data = await res.json();
    const apiMatches = (data?.data || []).filter(m => m.season_id === WC_SEASON_ID);
    
    if (apiMatches.length === 0) {
      return Response.json({ error: 'No World Cup 2026 matches found in API response' }, { status: 404 });
    }

    // Step 3: Create fresh Match records
    console.log(`[resetAndSync] Creating ${apiMatches.length} fresh matches...`);
    const matchPayloads = apiMatches.map(m => ({
      team_a: m.home_team?.name || 'Home',
      team_b: m.away_team?.name || 'Away',
      team_a_flag: m.home_team?.code || '',
      team_b_flag: m.away_team?.code || '',
      match_time: m.utc_date,
      status: 'upcoming',
      group_stage: m.group_label ? `Group ${m.group_label}` : 'World Cup 2026',
      stats_api_match_id: m.id,
      venue: m.venue?.name || '',
    }));
    
    const createdMatches = await base44.asServiceRole.entities.Match.bulkCreate(matchPayloads);
    console.log(`[resetAndSync] Created ${createdMatches.length} matches`);

    // Step 4: Create Bet records for each match with proper betting windows (kickoff + 1 hour)
    console.log('[resetAndSync] Creating Bet markets with proper betting windows...');
    const betPayloads = createdMatches.map(match => {
      const matchTime = new Date(match.match_time);
      const openUntil = new Date(matchTime.getTime() + 60 * 60 * 1000); // +1 hour
      
      return {
        match_id: match.id,
        title: `${match.team_a} vs ${match.team_b}`,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        outcome_draw: 'Draw',
        open_until: openUntil.toISOString(),
        status: 'open',
        stats_api_match_id: match.stats_api_match_id,
        odds_a: 0,
        odds_b: 0,
        odds_draw: 0,
        pool_a: 0,
        pool_b: 0,
        pool_draw: 0,
        total_pool: 0,
        total_bettors: 0,
        fee_percent: 0,
        solana_market_created: false,
      };
    });
    
    const createdBets = await base44.asServiceRole.entities.Bet.bulkCreate(betPayloads);
    console.log(`[resetAndSync] Created ${createdBets.length} bet markets`);

    // Step 5: Fetch live odds for all bets
    console.log('[resetAndSync] Fetching live odds from The Odds API...');
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h`
    );
    
    let oddsUpdated = 0;
    if (oddsRes.ok) {
      const oddsData = await oddsRes.json();
      
      for (const bet of createdBets) {
        const match = createdMatches.find(m => m.id === bet.match_id);
        if (!match) continue;
        
        // Find matching game from odds API
        const game = oddsData.find(g => 
          (g.home_team === match.team_a || g.home_team === match.team_b) &&
          (g.away_team === match.team_b || g.away_team === match.team_a)
        );
        
        if (game && game.bookmakers && game.bookmakers.length > 0) {
          const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
          const bookmaker = pinnacle || game.bookmakers[0];
          
          if (bookmaker && bookmaker.markets && bookmaker.markets[0]?.outcomes) {
            const outcomes = bookmaker.markets[0].outcomes;
            const homeOutcome = outcomes.find(o => o.name === match.team_a);
            const awayOutcome = outcomes.find(o => o.name === match.team_b);
            const drawOutcome = outcomes.find(o => o.name === 'Draw');
            
            await base44.asServiceRole.entities.Bet.update(bet.id, {
              odds_a: homeOutcome?.price || 0,
              odds_b: awayOutcome?.price || 0,
              odds_draw: drawOutcome?.price || 0,
              odds_bookmaker: bookmaker.key,
              odds_updated_at: new Date().toISOString(),
            });
            
            oddsUpdated++;
          }
        }
      }
    }
    
    console.log(`[resetAndSync] Updated odds for ${oddsUpdated} bets`);

    return Response.json({
      success: true,
      message: `✅ Complete reset successful!\n\n• Deleted all old data\n• Created ${createdMatches.length} fresh matches from API\n• Created ${createdBets.length} bet markets\n• Updated odds for ${oddsUpdated} bets\n\nAll data is now 100% clean and synced with real World Cup 2026 data!`,
      matchesCreated: createdMatches.length,
      betsCreated: createdBets.length,
      oddsUpdated,
    });
    
  } catch (error) {
    console.error('[resetAndSync] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});