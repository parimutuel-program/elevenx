import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Oracle Service for ElevenX - Backend Function
 * Fetches match results from oracle providers (Pyth, Switchboard) or manual verification
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admin can trigger oracle settlement
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { matchId, provider } = await req.json();

    if (!matchId) {
      return Response.json({ error: 'Missing matchId' }, { status: 400 });
    }

    // Get match data
    const matches = await base44.entities.Match.filter({ id: matchId });
    const match = matches[0];

    if (!match) {
      return Response.json({ error: 'Match not found' }, { status: 404 });
    }

    // Fetch oracle result
    const oracleResult = await fetchOracleResult(matchId, match, provider || 'manual');

    return Response.json({
      success: true,
      oracleResult,
      message: `Oracle result fetched: ${match.team_a} ${oracleResult.scoreA} - ${oracleResult.scoreB} ${match.team_b}`,
    });

  } catch (error) {
    console.error('Oracle service error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Fetch match result from oracle provider
 */
async function fetchOracleResult(matchId, match, provider = 'manual') {
  switch (provider) {
    case 'pyth':
      return await fetchPythResult(match);
    case 'switchboard':
      return await fetchSwitchboardResult(match);
    case 'manual':
    default:
      // Return manual verification template
      return {
        winner: 'pending',
        scoreA: match.score_a || 0,
        scoreB: match.score_b || 0,
        verified: false,
        provider: 'manual',
        message: 'Manual verification required - admin to confirm result',
      };
  }
}

/**
 * Fetch result from Pyth Network
 */
async function fetchPythResult(match) {
  try {
    // Pyth Network sports data integration
    // Note: Actual implementation requires Pyth sports data feed subscription
    const PYTH_BASE_URL = 'https://hermes.pyth.network';
    
    // For now, return a template response
    // In production, query actual Pyth sports feeds
    console.log('Fetching Pyth result for:', match.team_a, 'vs', match.team_b);
    
    // TODO: Replace with actual Pyth API call when sports feeds are available
    // Example: const response = await fetch(`${PYTH_BASE_URL}/api/latest_v2/price_feeds/{FEED_ID}/price`);
    
    return {
      winner: 'pending',
      scoreA: match.score_a || 0,
      scoreB: match.score_b || 0,
      verified: false,
      provider: 'pyth',
      message: 'Pyth sports feeds integration pending - using manual verification',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Pyth fetch error:', error);
    throw new Error(`Pyth oracle failed: ${error.message}`);
  }
}

/**
 * Fetch result from Switchboard Oracle
 */
async function fetchSwitchboardResult(match) {
  try {
    // Switchboard oracle integration
    const SWITCHBOARD_BASE_URL = 'https://api.switchboard.xyz';
    
    console.log('Fetching Switchboard result for:', match.team_a, 'vs', match.team_b);
    
    // TODO: Replace with actual Switchboard API call
    // Example: const response = await fetch(`${SWITCHBOARD_BASE_URL}/feed/{FEED_ID}`);
    
    return {
      winner: 'pending',
      scoreA: match.score_a || 0,
      scoreB: match.score_b || 0,
      verified: false,
      provider: 'switchboard',
      message: 'Switchboard sports feeds integration pending - using manual verification',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Switchboard fetch error:', error);
    throw new Error(`Switchboard oracle failed: ${error.message}`);
  }
}

/**
 * Get oracle provider status
 */
async function getOracleStatus(provider = 'manual') {
  try {
    const startTime = Date.now();
    let online = false;
    
    if (provider === 'pyth') {
      const response = await fetch('https://hermes.pyth.network/api/latest_v2/price_feeds', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      online = response.ok;
    } else if (provider === 'switchboard') {
      const response = await fetch('https://api.switchboard.xyz/health', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      online = response.ok;
    } else {
      online = true; // Manual is always available
    }
    
    const latency = Date.now() - startTime;
    
    return {
      online,
      latency,
      provider,
      lastUpdate: new Date().toISOString(),
    };
  } catch (error) {
    return {
      online: false,
      latency: -1,
      provider,
      error: error.message,
    };
  }
}