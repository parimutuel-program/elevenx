import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fetch live scores from The Odds API and update Match entities
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const API_KEY = Deno.env.get('THE_ODDS_API_KEY');
    if (!API_KEY) return Response.json({ error: 'THE_ODDS_API_KEY not set' }, { status: 500 });

    // Fetch all matches with scores from The Odds API
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/scores/?apiKey=${API_KEY}&daysFrom=3`;
    console.log('[syncScores] Fetching:', url);
    
    let response;
    let retries = 3;
    let retryDelay = 2000; // Start with 2 second delay
    
    // Retry logic for rate limits
    for (let attempt = 0; attempt < retries; attempt++) {
      if (attempt > 0) {
        console.log(`[syncScores] Retry attempt ${attempt + 1}/${retries} after ${retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2; // Exponential backoff
      }
      
      response = await fetch(url);
      console.log('[syncScores] API Response Status:', response.status);
      
      if (response.status === 429) {
        console.log('[syncScores] Rate limited, will retry...');
        continue;
      }
      
      break;
    }
    
    if (response.status === 429) {
      return Response.json({ 
        error: 'The Odds API rate limit exceeded', 
        message: 'Too many requests. Please wait 5-10 minutes before fetching scores again.'
      }, { status: 429 });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[syncScores] Error response:', errorText);
      return Response.json({ 
        error: 'API request failed', 
        message: `Status: ${response.status} - ${errorText}` 
      }, { status: response.status });
    }
    
    const allMatches = await response.json();
    console.log('[syncScores] Parsed matches:', allMatches.length);
    
    if (!Array.isArray(allMatches)) {
      return Response.json({ 
        error: 'Invalid API response', 
        message: 'Expected array of matches' 
      }, { status: 500 });
    }

    // Fetch all matches from database
    const dbMatches = await base44.entities.Match.list();
    
    const updates = [];
    const updated = [];

    for (const dbMatch of dbMatches) {
      // Find matching game by team names (flexible matching)
      const matchedGame = allMatches.find(game => {
        const home = game.home_team.toLowerCase();
        const away = game.away_team.toLowerCase();
        const teamA = dbMatch.team_a.toLowerCase();
        const teamB = dbMatch.team_b.toLowerCase();
        
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
        continue;
      }

      // Extract scores from scores array: [{name, score}]
      let scoreA = 0;
      let scoreB = 0;
      
      if (matchedGame.scores && Array.isArray(matchedGame.scores)) {
        const homeScoreObj = matchedGame.scores.find(s => s.name === matchedGame.home_team);
        const awayScoreObj = matchedGame.scores.find(s => s.name === matchedGame.away_team);
        scoreA = homeScoreObj?.score ? parseInt(homeScoreObj.score) : 0;
        scoreB = awayScoreObj?.score ? parseInt(awayScoreObj.score) : 0;
      }
      
      // Determine match status based on completed flag and scores
      let status = dbMatch.status;
      let winner = dbMatch.winner || '';
      
      if (!matchedGame.scores || matchedGame.scores.length === 0) {
        // No scores yet = upcoming
        status = 'upcoming';
      } else if (matchedGame.completed) {
        // Completed = finished
        status = 'finished';
        if (scoreA > scoreB) winner = 'team_a';
        else if (scoreB > scoreA) winner = 'team_b';
        else winner = 'draw';
      } else {
        // Has scores but not completed = live
        status = 'live';
      }

      updates.push({
        id: dbMatch.id,
        data: {
          score_a: scoreA,
          score_b: scoreB,
          status: status,
          winner: winner,
        }
      });

      updated.push({
        match_id: dbMatch.id,
        teams: `${dbMatch.team_a} vs ${dbMatch.team_b}`,
        score: `${scoreA} - ${scoreB}`,
        status: status,
        winner: winner,
      });
    }

    // Apply updates in small batches to avoid rate limiting
    if (updates.length > 0) {
      const BATCH_SIZE = 5;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(update => 
          base44.entities.Match.update(update.id, update.data)
        ));
        // Wait 500ms between batches
        if (i + BATCH_SIZE < updates.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    const message = updated.length > 0 
      ? `✅ Updated ${updated.length} matches with live scores`
      : `⚠️ No score updates found. Matches might not have started yet.`;

    return Response.json({
      success: updated.length > 0,
      message,
      updated,
    });

  } catch (error) {
    console.error('syncScores error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});