import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fetch live odds from TheStatsAPI for a given match
// Also can fetch match result for settlement

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { stats_api_match_id, match_id, action } = body;
    
    // Support both 'stats_api_match_id' and 'match_id' parameter names
    const actualMatchId = stats_api_match_id || match_id;
    
    console.log('fetchMatchOdds - received payload:', { stats_api_match_id, match_id, action });
    console.log('Using match ID:', actualMatchId);

    const API_KEY = Deno.env.get('THE_STATS_API_KEY');
    if (!API_KEY) return Response.json({ error: 'THE_STATS_API_KEY not set' }, { status: 500 });

    if (!actualMatchId) {
      return Response.json({ error: 'Missing match_id parameter' }, { status: 400 });
    }

    // action = 'odds' | 'result'
    if (action === 'result') {
      // Fetch match result
      const res = await fetch(`https://api.thestatsapi.com/api/football/matches/${actualMatchId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      const match = data.data;
      if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

      return Response.json({
        status: match.status, // scheduled | live | finished
        score: match.score,   // { home, away }
        winner: match.score
          ? match.score.home > match.score.away ? 'home'
          : match.score.away > match.score.home ? 'away'
          : 'draw'
          : null,
      });
    }

    // Default: fetch odds via /odds endpoint
    const url = `https://api.thestatsapi.com/api/football/matches/${actualMatchId}/odds`;
    console.log('Fetching odds from:', url);
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    console.log('API response status:', res.status);
    
    if (!res.ok) {
      console.error('TheStatsAPI odds fetch failed:', res.status, res.url);
      let errorText = 'Unknown error';
      try {
        const errJson = await res.json();
        errorText = errJson?.error?.message || errJson?.error || 'Unknown API error';
        console.error('Error response:', errorText);
      } catch {
        try {
          errorText = await res.text();
          console.error('Error response (text):', errorText.slice(0, 200));
        } catch {}
      }
      
      // Handle specific error cases
      if (res.status === 404 && errorText.includes('Odds not found')) {
        return Response.json({ odds: null, message: 'No odds available yet for this match. Bookmakers typically post odds 1-7 days before kickoff.' });
      }
      
      return Response.json({ error: `Failed to fetch odds: ${errorText}` }, { status: res.status });
    }

    const json = await res.json();
    console.log('TheStatsAPI response:', JSON.stringify(json, null, 2));
    
    // Response structure: { data: { match_id, bookmakers: [{ bookmaker, markets: { match_odds: { home, draw, away } } }] } }
    // OR: { data: { odds: { bet365: { '1x2': { home, draw, away } } } } }
    const data = json?.data;
    
    if (!data) {
      return Response.json({ odds: null, message: 'No odds data available' });
    }
    
    // Try new format first: bookmakers array
    let odds1x2 = null;
    let bookmakerName = null;
    
    if (data.bookmakers && Array.isArray(data.bookmakers)) {
      const bm = data.bookmakers.find(b => b.bookmaker === 'Bet365' || b.bookmaker === 'Pinnacle');
      if (bm?.markets?.match_odds) {
        odds1x2 = bm.markets.match_odds;
        bookmakerName = bm.bookmaker;
      }
    }
    
    // Fallback to old format: odds object
    if (!odds1x2 && data.odds) {
      const oddsData = data.odds;
      const bm = oddsData.bet365 || oddsData.pinnacle || oddsData.kambi || oddsData.betfair;
      if (bm?.['1x2']) {
        odds1x2 = bm['1x2'];
        bookmakerName = bm === oddsData.bet365 ? 'Bet365' : bm === oddsData.pinnacle ? 'Pinnacle' : 'Other';
      }
    }
    
    if (!odds1x2) {
      return Response.json({ odds: null, message: 'No 1X2 odds available yet' });
    }

    return Response.json({
      odds: {
        home: parseFloat(odds1x2.home || odds1x2['home'] || 0),
        draw: parseFloat(odds1x2.draw || odds1x2['draw'] || 0),
        away: parseFloat(odds1x2.away || odds1x2['away'] || 0),
      },
      bookmaker: bookmakerName || 'TheStatsAPI',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});