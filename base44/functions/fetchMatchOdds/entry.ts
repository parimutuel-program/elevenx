import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fetch live odds from TheStatsAPI for a given match
// Also can fetch match result for settlement

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { stats_api_match_id, action } = body;

    const API_KEY = Deno.env.get('THE_STATS_API_KEY');
    if (!API_KEY) return Response.json({ error: 'THE_STATS_API_KEY not set' }, { status: 500 });

    // action = 'odds' | 'result'
    if (action === 'result') {
      // Fetch match result
      const res = await fetch(`https://api.thestatsapi.com/api/football/matches/${stats_api_match_id}`, {
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

    // Default: fetch odds
    const res = await fetch(`https://api.thestatsapi.com/api/football/odds?match_id=${stats_api_match_id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      return Response.json({ error: `Stats API error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const bookmakers = data?.data || [];

    // Prefer Pinnacle, fallback to first available
    const bm = bookmakers.find(b => b.bookmaker === 'Pinnacle') || bookmakers[0];
    if (!bm) return Response.json({ odds: null, message: 'No odds available yet' });

    // Find 1X2 market
    const mo = bm.markets?.find(mk => mk.name === '1X2') || bm.markets?.[0];
    if (!mo) return Response.json({ odds: null, message: 'No 1X2 market available' });

    const outcomes = mo.outcomes || {};
    return Response.json({
      odds: {
        home: parseFloat(outcomes.home?.price || outcomes['1']?.price || 0),
        draw: parseFloat(outcomes.draw?.price || outcomes['X']?.price || 0),
        away: parseFloat(outcomes.away?.price || outcomes['2']?.price || 0),
      },
      bookmaker: bm.bookmaker,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});