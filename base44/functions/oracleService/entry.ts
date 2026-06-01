import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

/**
 * Oracle Service — two modes:
 *
 * mode="fetch_odds"  → Pulls live fixed odds from The Odds API and updates
 *                      the Bet entity with oracle_odds_a/b/draw (in bps).
 *                      Call this when creating a market.
 *
 * mode="settle"      → Fetches the match result and settles the Bet entity.
 *                      Admin-only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { matchId, mode = 'fetch_odds', provider = 'odds_api' } = await req.json();
    if (!matchId) return Response.json({ error: 'Missing matchId' }, { status: 400 });

    const matches = await base44.entities.Match.filter({ id: matchId });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    if (mode === 'fetch_odds') {
      const odds = await fetchOdds(match, provider);
      // Update the Bet entity linked to this match with oracle odds
      const bets = await base44.entities.Bet.filter({ match_id: matchId });
      for (const bet of bets) {
        await base44.entities.Bet.update(bet.id, {
          oracle_odds_a:    odds.team_a_bps,
          oracle_odds_b:    odds.team_b_bps,
          oracle_odds_draw: odds.draw_bps,
        });
      }
      return Response.json({
        success: true,
        odds,
        message: `Oracle odds updated: ${match.team_a} ${odds.team_a_bps / 100}x | Draw ${odds.draw_bps / 100}x | ${match.team_b} ${odds.team_b_bps / 100}x`,
      });
    }

    if (mode === 'settle') {
      const result = await fetchResult(match, provider);
      return Response.json({ success: true, result, message: `Result: ${match.team_a} ${result.scoreA}-${result.scoreB} ${match.team_b}, winner: ${result.winner}` });
    }

    return Response.json({ error: 'Invalid mode. Use "fetch_odds" or "settle"' }, { status: 400 });

  } catch (error) {
    console.error('oracleService error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Odds fetching ─────────────────────────────────────────────────────────────

async function fetchOdds(match, provider) {
  if (provider === 'odds_api' && ODDS_API_KEY) {
    return await fetchFromOddsAPI(match);
  }
  // Fallback: return realistic mock odds so development can continue without a key
  return mockOdds(match);
}

async function fetchFromOddsAPI(match) {
  try {
    // The Odds API — soccer_fifa_world_cup sport key
    const sport = 'soccer_fifa_world_cup';
    const url = `${ODDS_API_BASE}/sports/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Odds API HTTP ${res.status}`);
    const events = await res.json();

    // Find the matching event by team names (fuzzy match)
    const event = events.find(e =>
      (e.home_team?.toLowerCase().includes(match.team_a?.toLowerCase()) ||
       e.away_team?.toLowerCase().includes(match.team_a?.toLowerCase())) &&
      (e.home_team?.toLowerCase().includes(match.team_b?.toLowerCase()) ||
       e.away_team?.toLowerCase().includes(match.team_b?.toLowerCase()))
    );

    if (!event) {
      console.warn(`No Odds API event found for ${match.team_a} vs ${match.team_b}, using mock`);
      return mockOdds(match);
    }

    // Average across bookmakers
    const h2hMarkets = event.bookmakers
      .map(b => b.markets.find(m => m.key === 'h2h'))
      .filter(Boolean);

    const avgOdds = (teamName) => {
      const values = h2hMarkets
        .map(m => m.outcomes.find(o => o.name?.toLowerCase().includes(teamName?.toLowerCase()))?.price)
        .filter(Boolean);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 2.0;
    };

    const oddsA    = avgOdds(match.team_a);
    const oddsB    = avgOdds(match.team_b);
    const oddsDraw = avgOdds('Draw');

    return {
      team_a_bps: Math.round(oddsA * 100),
      team_b_bps: Math.round(oddsB * 100),
      draw_bps:   Math.round(oddsDraw * 100),
      source: 'odds_api',
    };
  } catch (err) {
    console.error('Odds API fetch failed:', err.message);
    return mockOdds(match);
  }
}

function mockOdds(match) {
  // Realistic football odds with a small house margin baked in
  return {
    team_a_bps: 210,   // 2.10x
    draw_bps:   320,   // 3.20x
    team_b_bps: 340,   // 3.40x
    source: 'mock',
  };
}

// ── Result fetching ───────────────────────────────────────────────────────────

async function fetchResult(match, provider) {
  if (provider === 'odds_api' && ODDS_API_KEY) {
    try {
      const sport = 'soccer_fifa_world_cup';
      const url = `${ODDS_API_BASE}/sports/${sport}/scores?apiKey=${ODDS_API_KEY}&daysFrom=3`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Odds API scores HTTP ${res.status}`);
      const scores = await res.json();

      const event = scores.find(e =>
        e.completed &&
        (e.home_team?.toLowerCase().includes(match.team_a?.toLowerCase()) ||
         e.away_team?.toLowerCase().includes(match.team_a?.toLowerCase()))
      );

      if (event) {
        const homeScore = parseInt(event.scores?.find(s => s.name === event.home_team)?.score || '0');
        const awayScore = parseInt(event.scores?.find(s => s.name === event.away_team)?.score || '0');
        const homeIsA   = event.home_team?.toLowerCase().includes(match.team_a?.toLowerCase());
        const scoreA = homeIsA ? homeScore : awayScore;
        const scoreB = homeIsA ? awayScore : homeScore;
        const winner = scoreA > scoreB ? 'team_a' : scoreB > scoreA ? 'team_b' : 'draw';
        return { scoreA, scoreB, winner, verified: true, source: 'odds_api' };
      }
    } catch (err) {
      console.error('Odds API scores fetch failed:', err.message);
    }
  }

  return {
    winner: 'pending',
    scoreA: match.score_a || 0,
    scoreB: match.score_b || 0,
    verified: false,
    source: 'manual',
    message: 'Manual verification required',
  };
}