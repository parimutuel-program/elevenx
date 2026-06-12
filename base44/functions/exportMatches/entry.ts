import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Export all matches as plain text list with match_ids and timing.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - admin only' }, { status: 403 });
    }
    
    // Fetch all matches
    const matches = await base44.entities.Match.list('-match_time', 500);
    
    // Build plain text list
    let output = 'COMPLETE MATCH LIST - ELEVENX BETTING PLATFORM\n';
    output += '='.repeat(80) + '\n\n';
    output += `Total Matches: ${matches.length}\n`;
    output += `Export Date: ${new Date().toISOString()}\n\n`;
    output += '='.repeat(80) + '\n\n';
    
    matches.forEach((match, index) => {
      output += `${index + 1}. Match ID: ${match.id}\n`;
      output += `   ${match.team_a || ''} ${match.team_a_flag || ''} vs ${match.team_b || ''} ${match.team_b_flag || ''}\n`;
      output += `   Group: ${match.group_stage || 'TBD'} | Venue: ${match.venue || 'TBD'}\n`;
      output += `   Kick-off: ${match.match_time} (UTC)\n`;
      output += `   End Time: ${match.match_end_time} (UTC)\n`;
      output += `   Status: ${match.status || 'upcoming'} | Score: ${match.score_a || 0}-${match.score_b || 0}\n`;
      if (match.winner) output += `   Winner: ${match.winner}\n`;
      output += '\n';
    });
    
    // Return as plain text
    return new Response(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="matches_list.txt"',
      },
    });
    
  } catch (error) {
    console.error('[exportMatches] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});