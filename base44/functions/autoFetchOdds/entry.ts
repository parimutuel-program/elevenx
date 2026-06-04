import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Auto-fetch live odds from The Odds API for all open bets
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const API_KEY = Deno.env.get('THE_ODDS_API_KEY');
    if (!API_KEY) return Response.json({ error: 'THE_ODDS_API_KEY not set' }, { status: 500 });

    // Fetch all odds from The Odds API
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/`;
    const params = new URLSearchParams({
        apiKey: API_KEY,
        regions: 'eu,us',
        markets: 'h2h',
        oddsFormat: 'decimal'
    });
    const response = await fetch(`${url}?${params}`);
    
    if (!response.ok) {
      return Response.json({ 
        error: 'API request failed', 
        message: `Status: ${response.status}` 
      }, { status: response.status });
    }

    const allMatches = await response.json();
    
    if (!Array.isArray(allMatches)) {
      return Response.json({ 
        error: 'Invalid API response', 
        message: 'Expected array of matches' 
      }, { status: 500 });
    }

    // Fetch all open bets
    const bets = await base44.entities.Bet.filter({ status: 'open' });
    
    const updated = [];
    const errors = [];

    for (const bet of bets) {
      try {
        // Get the match to find team names
        const match = await base44.entities.Match.get(bet.match_id);
        if (!match) {
          errors.push({ bet_id: bet.id, error: 'Match not found' });
          continue;
        }

        // Find matching game by team names (flexible matching)
        const matchedGame = allMatches.find(game => {
          const home = game.home_team.toLowerCase();
          const away = game.away_team.toLowerCase();
          const teamA = match.team_a.toLowerCase();
          const teamB = match.team_b.toLowerCase();
          
          // Try exact match
          if (home === teamA && away === teamB) return true;
          
          // Try reverse (API might have teams swapped)
          if (home === teamB && away === teamA) return true;
          
          // Try partial match (e.g. "Czech Republic" vs "Czechia")
          if ((home.includes(teamA) || teamA.includes(home)) &&
              (away.includes(teamB) || teamB.includes(away))) return true;
          
          return false;
        });

        if (!matchedGame) {
          errors.push({ bet_id: bet.id, error: `Match not found in API: ${match.team_a} vs ${match.team_b}` });
          continue;
        }

        // Extract odds from Pinnacle first, then fallback to any bookmaker
        let bookmaker = matchedGame.bookmakers?.find(b => b.title === 'Pinnacle') || matchedGame.bookmakers?.[0];
        
        if (!bookmaker?.markets?.[0]?.outcomes) {
          errors.push({ bet_id: bet.id, error: 'No odds data from bookmakers' });
          continue;
        }

        const outcomes = bookmaker.markets[0].outcomes;
        const homeOdds = outcomes.find(o => o.name === matchedGame.home_team)?.price || 0;
        const awayOdds = outcomes.find(o => o.name === matchedGame.away_team)?.price || 0;
        const drawOdds = outcomes.find(o => o.name === 'Draw')?.price || 0;

        // Update bet with new odds
        await base44.entities.Bet.update(bet.id, {
          odds_a: parseFloat(homeOdds),
          odds_b: parseFloat(awayOdds),
          odds_draw: parseFloat(drawOdds),
          odds_bookmaker: bookmaker.title || 'The Odds API',
          odds_updated_at: new Date().toISOString(),
        });

        updated.push({
          bet_id: bet.id,
          odds: { home: parseFloat(homeOdds), draw: parseFloat(drawOdds), away: parseFloat(awayOdds) },
          bookmaker: bookmaker.title,
        });

      } catch (error) {
        errors.push({ bet_id: bet.id, error: error.message });
      }
    }

    const message = updated.length > 0 
      ? `✅ Updated ${updated.length} bets with live odds`
      : `⚠️ No odds found. Matches might not be in API yet. Check team names match exactly.`;

    return Response.json({
      success: updated.length > 0,
      message,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('autoFetchOdds error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});