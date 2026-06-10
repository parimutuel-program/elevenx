/**
 * Oracle Normalizer - Stateless, Open-Source Result Translator
 * 
 * This function acts as a pure translator for sports data feeds.
 * It takes raw API scores and returns: 0 (Home Win), 1 (Away Win), or 2 (Draw).
 * 
 * SECURITY: This code is open-source and deterministic. Anyone can verify
 * it has no backdoors. Consensus from 3 independent sources protects against
 * single-point-of-failure or tampering.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const provider = url.searchParams.get('provider');
        const eventId = url.searchParams.get('event_id');

        if (!provider || !eventId) {
            return Response.json(
                { error: 'Missing provider or event_id parameter' },
                { status: 400 }
            );
        }

        let result;

        switch (provider) {
            case 'the-odds-api':
                result = await fetchTheOddsApiResult(eventId);
                break;
            case 'api-football':
                result = await fetchApiFootballResult(eventId);
                break;
            case 'sportradar':
                result = await fetchSportradarResult(eventId);
                break;
            default:
                return Response.json(
                    { error: 'Unsupported provider' },
                    { status: 400 }
                );
        }

        if (result === null) {
            return Response.json(
                { error: 'Match not completed or data unavailable' },
                { status: 404 }
            );
        }

        // Return normalized result: 0=Home, 1=Away, 2=Draw
        return Response.json({ result });
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: 500 }
        );
    }
});

async function fetchTheOddsApiResult(eventId) {
    const apiKey = Deno.env.get('THE_ODDS_API_KEY');
    if (!apiKey) {
        throw new Error('THE_ODDS_API_KEY not configured');
    }

    // Fetch completed games from last 3 days
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/scores?daysFrom=3&eventIds=${eventId}&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
    }

    const match = data.find(m => m.id === eventId);
    if (!match || !match.completed) {
        return null; // Match not completed yet
    }

    if (!match.scores || match.scores.length === 0) {
        return null;
    }

    // Find the score entry for this event
    const scoreData = match.scores[0];
    const homeScore = scoreData.score[0]; // Home team score
    const awayScore = scoreData.score[1]; // Away team score

    // Normalize: 0=Home Win, 1=Away Win, 2=Draw
    if (homeScore > awayScore) return 0;
    if (homeScore < awayScore) return 1;
    return 2;
}

async function fetchApiFootballResult(fixtureId) {
    // Note: API-Football key would need to be added as a secret
    const apiKey = Deno.env.get('API_FOOTBALL_KEY');
    if (!apiKey) {
        // Fallback: return null if key not available
        return null;
    }

    const url = `https://v3.football.api-sports.io/fixtures?id=${fixtureId}`;
    
    const response = await fetch(url, {
        headers: {
            'x-apisports-key': apiKey
        }
    });
    const data = await response.json();

    if (!data.response || data.response.length === 0) {
        return null;
    }

    const fixture = data.response[0];
    
    // Only accept finished matches
    if (fixture.fixture.status.short !== 'FT') {
        return null;
    }

    const homeScore = fixture.goals.home;
    const awayScore = fixture.goals.away;

    if (homeScore === null || awayScore === null) {
        return null;
    }

    // Normalize: 0=Home Win, 1=Away Win, 2=Draw
    if (homeScore > awayScore) return 0;
    if (homeScore < awayScore) return 1;
    return 2;
}

async function fetchSportradarResult(matchId) {
    // Note: Sportradar key would need to be added as a secret
    const apiKey = Deno.env.get('SPORTRADAR_KEY');
    if (!apiKey) {
        return null;
    }

    const url = `https://api.sportradar.com/soccer/trial/v4/en/matches/${matchId}/summary.json?api_key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!data.sport_event_status || data.sport_event_status.status !== 'closed') {
        return null;
    }

    // Sportradar returns winner_id which we need to map
    // For simplicity, we assume home team is first, away is second
    // This would need customization based on actual Sportradar response format
    const winnerId = data.sport_event_status.winner_id;
    
    // Normalize based on winner_id mapping
    // This is a placeholder - actual implementation depends on Sportradar's format
    if (winnerId === 'home') return 0;
    if (winnerId === 'away') return 1;
    if (winnerId === 'draw' || !winnerId) return 2;

    return null;
}