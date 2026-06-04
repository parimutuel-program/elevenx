import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
        }

        const { bet_id } = await req.json();
        
        if (!bet_id) {
            return Response.json({ error: 'Missing bet_id' }, { status: 400 });
        }

        // Get the bet to find team names
        const bet = await base44.entities.Bet.get(bet_id);
        if (!bet) {
            return Response.json({ error: 'Bet not found' }, { status: 404 });
        }

        // Get the match
        const match = await base44.entities.Match.get(bet.match_id);
        if (!match) {
            return Response.json({ error: 'Match not found' }, { status: 404 });
        }

        // Call The Odds API
        const apiKey = Deno.env.get('THE_ODDS_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'THE_ODDS_API_KEY not configured' }, { status: 500 });
        }

        const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${apiKey}&regions=eu,us&markets=h2h&oddsFormat=decimal`;
        const oddsRes = await fetch(url);

        if (!oddsRes.ok) {
            return Response.json({ 
                error: 'API request failed', 
                message: `Status: ${oddsRes.status}` 
            }, { status: oddsRes.status });
        }

        const allMatches = await oddsRes.json();
        
        if (!Array.isArray(allMatches)) {
            return Response.json({ 
                error: 'Invalid API response', 
                message: 'Expected array of matches' 
            }, { status: 500 });
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
            return Response.json({ 
                error: 'Match not found in API', 
                message: `Could not find ${match.team_a} vs ${match.team_b}. Make sure team names match exactly.` 
            }, { status: 404 });
        }

        // Extract odds from Pinnacle first, then fallback to any bookmaker
        let bookmaker = matchedGame.bookmakers?.find(b => b.title === 'Pinnacle') || matchedGame.bookmakers?.[0];
        
        if (!bookmaker?.markets?.[0]?.outcomes) {
            return Response.json({ 
                error: 'No odds available', 
                message: 'No odds data from bookmakers' 
            }, { status: 404 });
        }

        const outcomes = bookmaker.markets[0].outcomes;
        const homeOdds = outcomes.find(o => o.name === matchedGame.home_team)?.price || 0;
        const awayOdds = outcomes.find(o => o.name === matchedGame.away_team)?.price || 0;
        const drawOdds = outcomes.find(o => o.name === 'Draw')?.price || 0;

        // Update bet entity with fresh odds
        await base44.entities.Bet.update(bet_id, {
            odds_a: homeOdds,
            odds_b: awayOdds,
            odds_draw: drawOdds,
            odds_bookmaker: bookmaker.title || 'The Odds API',
            odds_updated_at: new Date().toISOString()
        });

        return Response.json({
            success: true,
            bookmaker: bookmaker.title || 'The Odds API',
            odds: { home: homeOdds, away: awayOdds, draw: drawOdds },
            message: `Odds updated: ${match.team_a} ${homeOdds.toFixed(2)}x | Draw ${drawOdds.toFixed(2)}x | ${match.team_b} ${awayOdds.toFixed(2)}x`
        });

    } catch (error) {
        console.error('refreshMatchOdds error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});