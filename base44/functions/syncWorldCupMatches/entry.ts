import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Syncs World Cup 2026 matches from TheStatsAPI.
// Filters by competition_id=comp_6107 AND season_id=sn_118868 (WC 2026 only).
// Uses bulkCreate for efficiency. Admin-only. Safe to run multiple times.

const WC_COMPETITION_ID = 'comp_6107';
const WC_SEASON_ID = 'sn_118868';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const API_KEY = Deno.env.get('THE_STATS_API_KEY');
    if (!API_KEY) return Response.json({ error: 'THE_STATS_API_KEY not set' }, { status: 500 });

    // Fetch all WC 2026 matches from the API (page 1 only — 100 results, WC has ~104 matches)
    const res = await fetch(
      `https://api.thestatsapi.com/api/football/matches?competition_id=${WC_COMPETITION_ID}&per_page=100&page=1`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `API error ${res.status}: ${text}` }, { status: 500 });
    }
    const data = await res.json();
    const apiMatches = (data?.data || []).filter(m => m.season_id === WC_SEASON_ID);

    if (apiMatches.length === 0) {
      return Response.json({ success: true, message: 'No WC 2026 matches found on page 1.', created: 0, skipped: 0 });
    }

    // Load existing records to skip duplicates
    const existingMatches = await base44.asServiceRole.entities.Match.list('-created_date', 500);
    const existingBets = await base44.asServiceRole.entities.Bet.list('-created_date', 500);
    const existingStatIds = new Set(existingMatches.map(m => m.stats_api_match_id).filter(Boolean));
    const betByMatchStatId = {};
    existingBets.forEach(b => { if (b.stats_api_match_id) betByMatchStatId[b.stats_api_match_id] = b; });

    // Split into new vs existing
    const toCreate = apiMatches.filter(m => !existingStatIds.has(m.id));
    const skipped = apiMatches.length - toCreate.length;

    if (toCreate.length === 0) {
      return Response.json({
        success: true,
        message: `All ${skipped} matches already synced. Nothing to do.`,
        created: 0,
        skipped,
      });
    }

    // Bulk-create all new Match records at once
    const matchPayloads = toCreate.map(m => ({
      team_a: m.home_team?.name || 'Home',
      team_b: m.away_team?.name || 'Away',
      match_time: m.utc_date,
      status: 'upcoming',
      group_stage: m.group_label ? `Group ${m.group_label}` : 'World Cup 2026',
      stats_api_match_id: m.id,
      venue: m.venue?.name || '',
    }));
    const createdMatches = await base44.asServiceRole.entities.Match.bulkCreate(matchPayloads);

    return Response.json({
      success: true,
      message: `Sync complete: ${createdMatches.length} new matches created, ${skipped} already existed.`,
      created: createdMatches.length,
      skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});