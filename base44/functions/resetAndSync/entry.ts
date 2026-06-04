import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only function to completely reset all betting data and re-sync from The Odds API ONLY
// Deletes: UserBets, BetOffers, LpPositions, Bets, FuturesMarkets, Matches
// Then re-syncs fresh World Cup matches with live odds from The Odds API
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const API_KEY = Deno.env.get('THE_ODDS_API_KEY');
    
    if (!API_KEY) {
      return Response.json({ error: 'THE_ODDS_API_KEY not set' }, { status: 500 });
    }

    console.log('[resetAndSync] Starting complete database reset...');

    // Step 1: Delete all user-facing data (in order of dependencies)
    // Helper to safely delete entities with rate limit handling
    const safeDelete = async (entityType, id) => {
      let retries = 3;
      while (retries > 0) {
        try {
          await base44.asServiceRole.entities[entityType].delete(id);
          return;
        } catch (err) {
          if (err.status === 429) {
            retries--;
            if (retries === 0) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else if (err.status !== 404) {
            throw err;
          }
        }
      }
    };

    console.log('[resetAndSync] Fetching and deleting UserBets...');
    const userBets = await base44.asServiceRole.entities.UserBet.list();
    for (const ub of userBets) await safeDelete('UserBet', ub.id);
    
    console.log('[resetAndSync] Fetching and deleting BetOffers...');
    const betOffers = await base44.asServiceRole.entities.BetOffer.list();
    for (const bo of betOffers) await safeDelete('BetOffer', bo.id);
    
    console.log('[resetAndSync] Fetching and deleting LpPositions...');
    const lpPositions = await base44.asServiceRole.entities.LpPosition.list();
    for (const lp of lpPositions) await safeDelete('LpPosition', lp.id);
    
    console.log('[resetAndSync] Fetching and deleting Bets...');
    const bets = await base44.asServiceRole.entities.Bet.list();
    for (const bet of bets) await safeDelete('Bet', bet.id);
    
    console.log('[resetAndSync] Fetching and deleting FuturesMarkets...');
    const futures = await base44.asServiceRole.entities.FuturesMarket.list();
    for (const fm of futures) await safeDelete('FuturesMarket', fm.id);
    
    console.log('[resetAndSync] Fetching and deleting Matches...');
    const matches = await base44.asServiceRole.entities.Match.list();
    for (const m of matches) await safeDelete('Match', m.id);

    // Step 2: Fetch fresh World Cup matches from The Odds API ONLY
    console.log('[resetAndSync] Fetching fresh World Cup matches from The Odds API...');
    
    // Retry logic for rate limits
    let res;
    let retries = 3;
    while (retries > 0) {
      res = await fetch(
        `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${API_KEY}&regions=eu&markets=h2h`
      );
      
      if (res.status === 429) {
        retries--;
        if (retries === 0) {
          return Response.json({ 
            error: 'The Odds API rate limit exceeded. Please wait a few minutes and try again.',
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
      if (res.status === 401) {
        return Response.json({ 
          error: 'Invalid THE_ODDS_API_KEY. Check your API key in Dashboard → Settings → Secrets.',
          status_code: 401
        }, { status: 401 });
      }
      if (res.status === 403) {
        return Response.json({ 
          error: 'THE_ODDS_API_KEY has no active subscription. Please activate your API key at the-odds-api.com.',
          status_code: 403
        }, { status: 503 });
      }
      const text = await res.text();
      return Response.json({ error: `API error ${res.status}: ${text}` }, { status: 500 });
    }
    
    const oddsData = await res.json();
    
    if (!oddsData || oddsData.length === 0) {
      return Response.json({ error: 'No World Cup matches found in The Odds API response' }, { status: 404 });
    }

    // Step 3: Create fresh Match and Bet records from The Odds API data
    console.log(`[resetAndSync] Creating ${oddsData.length} fresh matches with live odds...`);
    
    // World Cup 2026 Group mappings
    const teamGroups = {
      // Group A
      'Germany': 'Group A', 'Costa Rica': 'Group A', 'Jamaica': 'Group A', 'Morocco': 'Group A',
      // Group B
      'Mexico': 'Group B', 'South Africa': 'Group B', 'Iraq': 'Group B', 'Denmark': 'Group B',
      // Group C
      'Canada': 'Group C', 'Saudi Arabia': 'Group C', 'Tahiti': 'Group C', 'Croatia': 'Group C',
      // Group D
      'Spain': 'Group D', 'Japan': 'Group D', 'Angola': 'Group D', 'Paraguay': 'Group D',
      // Group E
      'France': 'Group E', 'South Korea': 'Group E', 'Iran': 'Group E', 'Ghana': 'Group E',
      // Group F
      'Brazil': 'Group F', 'Cameroon': 'Group F', 'Haiti': 'Group F', 'Austria': 'Group F',
      // Group G
      'Argentina': 'Group G', 'Algeria': 'Group G', 'Guatemala': 'Group G', 'Italy': 'Group G',
      // Group H
      'England': 'Group H', 'Serbia': 'Group H', 'Tunisia': 'Group H', 'Australia': 'Group H',
      // Group I
      'Netherlands': 'Group I', 'Ecuador': 'Group I', 'Qatar': 'Group I', 'Senegal': 'Group I',
      // Group J
      'Portugal': 'Group J', 'Chile': 'Group J', 'Jamaica': 'Group J', 'Egypt': 'Group J',
      // Group K
      'Belgium': 'Group K', 'USA': 'Group K', 'Turkey': 'Group K', 'New Zealand': 'Group K',
      // Group L
      'Colombia': 'Group L', 'Greece': 'Group L', 'India': 'Group L', 'Uruguay': 'Group L',
    };
    
    const matchPayloads = [];
    const betPayloads = [];
    
    oddsData.forEach(game => {
      // Create match record
      const matchTime = new Date(game.commence_time);
      const openUntil = new Date(matchTime.getTime() + 60 * 60 * 1000); // kickoff + 1 hour
      
      // Determine group from team names
      const groupA = teamGroups[game.home_team] || teamGroups[game.away_team] || 'Group Stage';
      
      matchPayloads.push({
        team_a: game.home_team,
        team_b: game.away_team,
        team_a_flag: '',
        team_b_flag: '',
        match_time: game.commence_time,
        status: 'upcoming',
        group_stage: groupA,
        venue: '',
      });
      
      // Extract odds from Pinnacle or first available bookmaker
      let odds_a = 0, odds_b = 0, odds_draw = 0;
      let bookmaker = 'unknown';
      
      const pinnacle = game.bookmakers?.find(b => b.key === 'pinnacle');
      const bm = pinnacle || (game.bookmakers && game.bookmakers[0]);
      
      if (bm && bm.markets && bm.markets[0]?.outcomes) {
        const outcomes = bm.markets[0].outcomes;
        const homeOutcome = outcomes.find(o => o.name === game.home_team);
        const awayOutcome = outcomes.find(o => o.name === game.away_team);
        const drawOutcome = outcomes.find(o => o.name === 'Draw');
        
        odds_a = homeOutcome?.price || 0;
        odds_b = awayOutcome?.price || 0;
        odds_draw = drawOutcome?.price || 0;
        bookmaker = bm.key;
      }
      
      // Create bet record
      betPayloads.push({
        title: `${game.home_team} vs ${game.away_team}`,
        outcome_a: game.home_team,
        outcome_b: game.away_team,
        outcome_draw: 'Draw',
        open_until: openUntil.toISOString(),
        status: 'open',
        odds_a,
        odds_b,
        odds_draw,
        odds_bookmaker: bookmaker,
        odds_updated_at: new Date().toISOString(),
        pool_a: 0,
        pool_b: 0,
        pool_draw: 0,
        total_pool: 0,
        total_bettors: 0,
        fee_percent: 0,
        solana_market_created: false,
      });
    });
    
    // Bulk create matches first
    const createdMatches = await base44.asServiceRole.entities.Match.bulkCreate(matchPayloads);
    console.log(`[resetAndSync] Created ${createdMatches.length} matches`);
    
    // Link bets to matches
    const betsWithMatchId = betPayloads.map((bet, i) => ({
      ...bet,
      match_id: createdMatches[i].id,
    }));
    
    const createdBets = await base44.asServiceRole.entities.Bet.bulkCreate(betsWithMatchId);
    console.log(`[resetAndSync] Created ${createdBets.length} bet markets with live odds`);

    return Response.json({
      success: true,
      message: `✅ Complete reset successful!\n\n• Deleted all old data\n• Created ${createdMatches.length} fresh matches from The Odds API\n• Created ${createdBets.length} bet markets with LIVE odds\n\nAll data is now 100% clean and synced!`,
      matchesCreated: createdMatches.length,
      betsCreated: createdBets.length,
    });
    
  } catch (error) {
    console.error('[resetAndSync] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});