import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // No auth required - this is public odds data
        // const user = await base44.auth.me();
        // if (!user || user.role !== 'admin') {
        //     return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
        // }

        const apiKey = Deno.env.get('THE_ODDS_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'THE_ODDS_API_KEY not configured' }, { status: 500 });
        }

        // Fetch FIFA World Cup 2026 odds
        const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${apiKey}&regions=eu,us&markets=h2h,totals,spreads&oddsFormat=decimal`;
        
        const response = await fetch(url);
        
        if (response.status === 429) {
            return Response.json({ 
                error: 'The Odds API rate limit exceeded',
                message: 'Too many requests. Please wait a few minutes before fetching odds again.',
                hint: 'The free tier allows 500 calls/month. Consider upgrading or reducing fetch frequency.'
            }, { status: 429 });
        }
        
        const data = await response.json();

        if (data.error) {
            return Response.json({ error: data.message || 'API Error' }, { status: 400 });
        }

        // API returns { data: [...] } format
        const matchesArray = Array.isArray(data) ? data : (data.data || []);
        
        if (!Array.isArray(matchesArray) || matchesArray.length === 0) {
            return Response.json({ 
                success: true, 
                count: 0, 
                matches: [],
                message: 'No matches found. The API might not have World Cup odds available yet.'
            });
        }

        // Parse and normalize odds data
        const matches = matchesArray.map(event => {
            // Extract bookmaker odds
            const bookmakers = event.bookmakers || [];
            
            // Get Pinnacle odds (preferred) or fallback to Bet365
            const pinnacle = bookmakers.find(b => b.key === 'pinnacle');
            const bet365 = bookmakers.find(b => b.key === 'bet365');
            const primaryBookmaker = pinnacle || bet365 || bookmakers[0];

            // Extract h2h (moneyline) odds
            const h2hMarkets = primaryBookmaker?.markets?.find(m => m.key === 'h2h') || {};
            const h2hOutcomes = h2hMarkets.outcomes || [];

            // Find home, draw, away odds
            const homeOdds = h2hOutcomes.find(o => o.name === event.home_team)?.price || 0;
            const awayOdds = h2hOutcomes.find(o => o.name === event.away_team)?.price || 0;
            const drawOdds = h2hOutcomes.find(o => o.name === 'Draw')?.price || 0;

            // Extract totals (over/under 2.5 goals)
            const totalsMarkets = primaryBookmaker?.markets?.find(m => m.key === 'totals') || {};
            const totalsOutcomes = totalsMarkets.outcomes || [];
            const over25 = totalsOutcomes.find(o => o.point === 2.5 && o.name === 'Over')?.price || 0;
            const under25 = totalsOutcomes.find(o => o.point === 2.5 && o.name === 'Under')?.price || 0;

            // Extract spreads/handicaps
            const spreadsMarkets = primaryBookmaker?.markets?.find(m => m.key === 'spreads') || {};
            const spreadsOutcomes = spreadsMarkets.outcomes || [];
            const homeSpread = spreadsOutcomes.find(o => o.team === event.home_team);
            const awaySpread = spreadsOutcomes.find(o => o.team === event.away_team);

            return {
                match_id: event.id,
                home_team: event.home_team,
                away_team: event.away_team,
                commence_time: event.commence_time,
                bookmaker: primaryBookmaker?.title || 'Unknown',
                bookmaker_key: primaryBookmaker?.key || 'unknown',
                odds: {
                    home: homeOdds,
                    away: awayOdds,
                    draw: drawOdds,
                    over_2_5: over25,
                    under_2_5: under25,
                    home_spread: homeSpread?.point || 0,
                    home_spread_odds: homeSpread?.price || 0,
                    away_spread: awaySpread?.point || 0,
                    away_spread_odds: awaySpread?.price || 0,
                },
                last_update: h2hMarkets.last_update || null,
            };
        });

        return Response.json({ 
            success: true,
            count: matches.length,
            matches 
        });

    } catch (error) {
        console.error('fetchTheOddsApi error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});