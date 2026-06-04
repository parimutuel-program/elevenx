import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const safeDelete = async (entityType, id, delayMs = 200) => {
      let retries = 5;
      while (retries > 0) {
        try {
          await base44.asServiceRole.entities[entityType].delete(id);
          if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
          return;
        } catch (err) {
          if (err.status === 429) {
            retries--;
            if (retries === 0) throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else if (err.status !== 404) {
            throw err;
          }
        }
      }
    };

    console.log('[resetAndSync] Fetching and deleting UserBets...');
    const userBets = await base44.asServiceRole.entities.UserBet.list();
    for (const ub of userBets) await safeDelete('UserBet', ub.id, 100);
    
    console.log('[resetAndSync] Fetching and deleting BetOffers...');
    const betOffers = await base44.asServiceRole.entities.BetOffer.list();
    for (const bo of betOffers) await safeDelete('BetOffer', bo.id, 100);
    
    console.log('[resetAndSync] Fetching and deleting LpPositions...');
    const lpPositions = await base44.asServiceRole.entities.LpPosition.list();
    for (const lp of lpPositions) await safeDelete('LpPosition', lp.id, 100);
    
    console.log('[resetAndSync] Fetching and deleting Bets...');
    const bets = await base44.asServiceRole.entities.Bet.list();
    for (const bet of bets) await safeDelete('Bet', bet.id, 150);
    
    console.log('[resetAndSync] Fetching and deleting FuturesMarkets...');
    const futures = await base44.asServiceRole.entities.FuturesMarket.list();
    for (const fm of futures) await safeDelete('FuturesMarket', fm.id, 100);
    
    console.log('[resetAndSync] Fetching and deleting Matches...');
    const matches = await base44.asServiceRole.entities.Match.list();
    for (const m of matches) await safeDelete('Match', m.id, 150);

    console.log('[resetAndSync] Fetching fresh World Cup matches from The Odds API...');
    
    let res;
    let retries = 3;
    while (retries > 0) {
      res = await fetch(
        `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${API_KEY}&regions=eu&markets=h2h`
      );
      
      if (res.status === 429) {
        retries--;
        if (retries === 0) {
          return Response.json({ error: 'API rate limit exceeded', status_code: 429 }, { status: 429 });
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }
    
    if (!res.ok) {
      return Response.json({ error: `API error ${res.status}` }, { status: 500 });
    }
    
    const oddsData = await res.json();
    
    if (!oddsData || oddsData.length === 0) {
      return Response.json({ error: 'No matches found' }, { status: 404 });
    }

    const teamGroups = {
      'Germany': 'Group A', 'Costa Rica': 'Group A', 'Jamaica': 'Group A', 'Morocco': 'Group A',
      'Mexico': 'Group B', 'South Africa': 'Group B', 'Iraq': 'Group B', 'Denmark': 'Group B',
      'Canada': 'Group C', 'Saudi Arabia': 'Group C', 'Tahiti': 'Group C', 'Croatia': 'Group C',
      'Spain': 'Group D', 'Japan': 'Group D', 'Angola': 'Group D', 'Paraguay': 'Group D',
      'France': 'Group E', 'South Korea': 'Group E', 'Iran': 'Group E', 'Ghana': 'Group E',
      'Brazil': 'Group F', 'Cameroon': 'Group F', 'Haiti': 'Group F', 'Austria': 'Group F',
      'Argentina': 'Group G', 'Algeria': 'Group G', 'Guatemala': 'Group G', 'Italy': 'Group G',
      'England': 'Group H', 'Serbia': 'Group H', 'Tunisia': 'Group H', 'Australia': 'Group H',
      'Netherlands': 'Group I', 'Ecuador': 'Group I', 'Qatar': 'Group I', 'Senegal': 'Group I',
      'Portugal': 'Group J', 'Chile': 'Group J', 'Egypt': 'Group J',
      'Belgium': 'Group K', 'USA': 'Group K', 'Turkey': 'Group K', 'New Zealand': 'Group K',
      'Colombia': 'Group L', 'Greece': 'Group L', 'India': 'Group L', 'Uruguay': 'Group L',
    };
    
    const matchPayloads = [];
    const betPayloads = [];
    
    oddsData.forEach(game => {
      const matchTime = new Date(game.commence_time);
      const openUntil = new Date(matchTime.getTime() + 60 * 60 * 1000);
      const groupStage = teamGroups[game.home_team] || teamGroups[game.away_team] || 'Group Stage';
      
      matchPayloads.push({
        team_a: game.home_team,
        team_b: game.away_team,
        team_a_flag: '',
        team_b_flag: '',
        match_time: game.commence_time,
        status: 'upcoming',
        group_stage: groupStage,
        venue: '',
      });
      
      let odds_a = 0, odds_b = 0, odds_draw = 0;
      let bookmaker = 'unknown';
      
      const pinnacle = game.bookmakers?.find(b => b.key === 'pinnacle');
      const bm = pinnacle || (game.bookmakers && game.bookmakers[0]);
      
      if (bm && bm.markets && bm.markets[0]?.outcomes) {
        const outcomes = bm.markets[0].outcomes;
        odds_a = outcomes.find(o => o.name === game.home_team)?.price || 0;
        odds_b = outcomes.find(o => o.name === game.away_team)?.price || 0;
        odds_draw = outcomes.find(o => o.name === 'Draw')?.price || 0;
        bookmaker = bm.key;
      }
      
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
    
    console.log('[resetAndSync] Creating matches...');
    const createdMatches = await base44.asServiceRole.entities.Match.bulkCreate(matchPayloads);
    console.log(`[resetAndSync] Created ${createdMatches.length} matches`);
    
    console.log('[resetAndSync] Linking bets to matches...');
    const betsWithMatchId = betPayloads.map((bet, i) => ({
      ...bet,
      match_id: createdMatches[i].id,
    }));
    
    console.log(`[resetAndSync] Creating ${betWithMatchId.length} bets...`);
    const createdBets = await base44.asServiceRole.entities.Bet.bulkCreate(betsWithMatchId);
    console.log(`[resetAndSync] Created ${createdBets.length} bets`);

    return Response.json({
      success: true,
      message: `✅ Reset successful! ${createdMatches.length} matches, ${createdBets.length} bets`,
      matchesCreated: createdMatches.length,
      betsCreated: createdBets.length,
    });
    
  } catch (error) {
    console.error('[resetAndSync] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});