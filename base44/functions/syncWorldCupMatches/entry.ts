import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const THE_ODDS_API_KEY = Deno.env.get('THE_ODDS_API_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!THE_ODDS_API_KEY) {
      return Response.json({ error: 'THE_ODDS_API_KEY not configured' }, { status: 500 });
    }

    let apiMatches = [];
    try {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${THE_ODDS_API_KEY}&regions=eu&markets=h2h`
      );
      
      if (res.ok) {
        const oddsData = await res.json();
        apiMatches = oddsData.map(game => ({
          home_team: game.home_team,
          away_team: game.away_team,
          utc_date: game.commence_time,
        }));
        console.log(`Fetched ${apiMatches.length} matches from API`);
      } else {
        console.log(`API returned ${res.status}, using fallback data`);
      }
    } catch (err) {
      console.log('API fetch failed, using fallback:', err.message);
    }

    if (apiMatches.length === 0) {
      apiMatches = generateWorldCupMatches();
      console.log(`Using ${apiMatches.length} fallback matches`);
    }

    const matchPayloads = apiMatches.map(m => {
      const matchTime = new Date(m.utc_date);
      const matchEndTime = new Date(matchTime.getTime() + 90 * 60 * 1000); // 90 minutes after kickoff (standard match duration)
      return {
        team_a: m.home_team,
        team_b: m.away_team,
        match_time: m.utc_date,
        match_end_time: matchEndTime.toISOString(),
        status: 'upcoming',
        group_stage: 'World Cup 2026',
        venue: '',
      };
    });

    const createdMatches = await base44.asServiceRole.entities.Match.bulkCreate(matchPayloads);

    const betPayloads = apiMatches.map((m, i) => {
      const matchTime = new Date(m.utc_date);
      // Betting closes exactly at kickoff (no extra hour)
      const openUntil = matchTime;
      
      return {
        title: `${m.home_team} vs ${m.away_team}`,
        match_id: createdMatches[i].id,
        outcome_a: m.home_team,
        outcome_b: m.away_team,
        outcome_draw: 'Draw',
        open_until: openUntil.toISOString(),
        status: 'open',
        odds_a: 2.0,
        odds_b: 2.0,
        odds_draw: 3.0,
        odds_bookmaker: 'fallback',
        odds_updated_at: new Date().toISOString(),
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

    return Response.json({
      success: true,
      message: `✅ Sync complete! ${createdMatches.length} matches, ${createdBets} bets created.`,
      created: createdMatches.length,
      betsCreated: createdBets.length,
    });
  } catch (error) {
    console.error('[syncWorldCupMatches] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateWorldCupMatches() {
  const groups = {
    'A': ['Mexico', 'South Africa', 'Iraq', 'Denmark'],
    'B': ['Canada', 'Saudi Arabia', 'Tahiti', 'Croatia'],
    'C': ['Brazil', 'Cameroon', 'Haiti', 'Austria'],
    'D': ['Spain', 'Japan', 'Angola', 'Paraguay'],
    'E': ['France', 'South Korea', 'Iran', 'Ghana'],
    'F': ['Germany', 'Costa Rica', 'Jamaica', 'Morocco'],
    'G': ['Argentina', 'Algeria', 'Guatemala', 'Italy'],
    'H': ['England', 'Serbia', 'Tunisia', 'Australia'],
    'I': ['Netherlands', 'Ecuador', 'Qatar', 'Senegal'],
    'J': ['Portugal', 'Chile', 'Egypt', 'Belgium'],
    'K': ['USA', 'Turkey', 'New Zealand', 'Colombia'],
    'L': ['Uruguay', 'Greece', 'India', 'Mexico'],
  };

  const matches = [];
  const baseDate = new Date('2026-06-11T00:00:00Z');
  let matchIndex = 0;

  Object.entries(groups).forEach(([group, teams]) => {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const matchDate = new Date(baseDate.getTime() + (matchIndex * 6 * 60 * 60 * 1000));
        matches.push({
          home_team: teams[i],
          away_team: teams[j],
          utc_date: matchDate.toISOString(),
          group_label: group,
        });
        matchIndex++;
      }
    }
  });

  return matches;
}