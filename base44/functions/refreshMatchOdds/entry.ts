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

        const apiKey = Deno.env.get('THE_ODDS_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'THE_ODDS_API_KEY not configured' }, { status: 500 });
        }

        // Fetch all odds from The Odds API
        const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${apiKey}&regions=eu,us&markets=h2h&oddsFormat=decimal`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return Response.json({ 
                error: 'API request failed', 
                message: `Status: ${response.status}` 
            }, { status: response.status });
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) {
            return Response.json({ 
                error: 'Invalid API response', 
                message: 'Expected array of matches' 
            }, { status: 500 });
        }

        // Get the bet to find team names
        const bet = await base44.entities.Bet.get(bet_id);
        if (!bet) {
            return Response.json({ error: 'Bet not found' }, { status: 404 });
        }

        // Find matching game by team names
        const matchedGame = data.find(game => {
            const homeMatch = game.home_team.toLowerCase() === bet.outcome_a.toLowerCase() ||
                             bet.outcome_a.toLowerCase().includes(game.home_team.toLowerCase());
            const awayMatch = game.away_team.toLowerCase() === bet.outcome_b.toLowerCase() ||
                             bet.outcome_b.toLowerCase().includes(game.away_team.toLowerCase());
            return homeMatch && awayMatch;
        });

        if (!matchedGame) {
            return Response.json({ 
                error: 'Match not found in API', 
                message: `Could not find ${bet.outcome_a} vs ${bet.outcome_b} in The Odds API` 
            }, { status: 404 });
        }

        // Extract odds from first bookmaker
        const bookmaker = matchedGame.bookmakers?.[0];
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
            message: 'Odds updated successfully'
        });

    } catch (error) {
        console.error('refreshMatchOdds error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});