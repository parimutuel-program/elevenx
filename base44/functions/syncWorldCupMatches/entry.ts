import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Syncs World Cup 2026 matches from TheStatsAPI, creates Match + Bet records, and fetches live odds.
// Admin-only. Safe to run multiple times — skips matches that already exist.

const WC_DATES = [
  '2026-06-11','2026-06-12','2026-06-13','2026-06-14','2026-06-15','2026-06-16',
  '2026-06-17','2026-06-18','2026-06-19','2026-06-20','2026-06-21','2026-06-22',
  '2026-06-23','2026-06-24','2026-06-25','2026-06-26','2026-06-27','2026-06-28',
  '2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03','2026-07-04',
  '2026-07-05','2026-07-06','2026-07-09','2026-07-10','2026-07-14','2026-07-18',
  '2026-07-19',
];

// Known World Cup teams to filter out non-WC matches
const WC_TEAMS = new Set([
  'Mexico','USA','Canada','Argentina','Australia','Bolivia','Chile','Colombia',
  'Ecuador','Paraguay','Peru','Uruguay','Venezuela','Morocco','Algeria','Egypt',
  'Senegal','South Africa','Cameroon','Ghana','Nigeria','Tunisia','Côte d\'Ivoire',
  'DR Congo','Zambia','Tanzania','Comoros','Iraq','Iran','Japan','South Korea',
  'Saudi Arabia','Australia','Indonesia','Jordan','Qatar','Uzbekistan','China',
  'Bahrain','Palestine','Kuwait','Oman','Thailand','Singapore','Bangladesh',
  'New Zealand','England','France','Germany','Spain','Portugal','Netherlands',
  'Belgium','Croatia','Czech Republic','Denmark','Hungary','Italy','Poland',
  'Romania','Serbia','Slovakia','Slovenia','Switzerland','Turkey','Ukraine',
  'Albania','Austria','Georgia','Scotland','Wales','Iceland','Estonia','Latvia',
  'Lithuania','Armenia','Azerbaijan','Belarus','Bosnia and Herzegovina','Finland',
  'Kosovo','Luxembourg','North Macedonia','Montenegro','Norway','Sweden',
  'Cape Verde','Benin','Equatorial Guinea','Guinea','Guinea-Bissau','Malawi',
  'Mali','Mozambique','Angola','Togo','Uganda','Zimbabwe','Liberia','Sudan',
  'Côte d\'Ivoire','Ethiopia','Madagascar','Namibia','Gambia','Libya','Panama',
  'Costa Rica','Honduras','Jamaica','Guatemala','El Salvador','Haiti','Cuba',
  'Trinidad and Tobago','Nicaragua','Bahamas','Curaçao','Guadeloupe',
  'Vietnam','Kyrgyzstan','Malaysia','India','Taiwan','Philippines','Lebanon',
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const API_KEY = Deno.env.get('THE_STATS_API_KEY');
    if (!API_KEY) return Response.json({ error: 'THE_STATS_API_KEY not set' }, { status: 500 });

    // Load existing matches to avoid duplicates
    const existingMatches = await base44.asServiceRole.entities.Match.list('-created_date', 500);
    const existingBets = await base44.asServiceRole.entities.Bet.list('-created_date', 500);
    const existingKeys = new Set(existingMatches.map(m => `${m.team_a}|${m.team_b}|${m.match_time?.slice(0,10)}`));
    const betByMatchId = {};
    existingBets.forEach(b => { betByMatchId[b.match_id] = b; });

    let created = 0;
    let oddsUpdated = 0;
    let skipped = 0;

    for (const date of WC_DATES) {
      // Fetch matches for this date
      const res = await fetch(`https://api.thestatsapi.com/api/football/matches?date_from=${date}&date_to=${date}&per_page=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const dayMatches = data?.data || [];

      // Filter to likely World Cup matches only
      const wcMatches = dayMatches.filter(m => {
        const home = m.teams?.home?.name || '';
        const away = m.teams?.away?.name || '';
        return WC_TEAMS.has(home) || WC_TEAMS.has(away);
      });

      for (const m of wcMatches) {
        const teamA = m.teams?.home?.name || 'Home';
        const teamB = m.teams?.away?.name || 'Away';
        const matchDate = date;
        const key = `${teamA}|${teamB}|${matchDate}`;

        let matchRecord;

        if (existingKeys.has(key)) {
          // Match already exists — find it
          matchRecord = existingMatches.find(em =>
            em.team_a === teamA && em.team_b === teamB && em.match_time?.slice(0,10) === matchDate
          );
          skipped++;
        } else {
          // Create the match
          matchRecord = await base44.asServiceRole.entities.Match.create({
            team_a: teamA,
            team_b: teamB,
            match_time: m.date || `${date}T00:00:00Z`,
            status: 'upcoming',
            group_stage: 'World Cup 2026',
            stats_api_match_id: m.id,
          });
          existingKeys.add(key);
          created++;
        }

        if (!matchRecord) continue;

        // Open market if not already open
        let bet = betByMatchId[matchRecord.id];
        if (!bet) {
          bet = await base44.asServiceRole.entities.Bet.create({
            match_id: matchRecord.id,
            outcome_a: teamA,
            outcome_b: teamB,
            outcome_draw: 'Draw',
            status: 'open',
            pool_a: 0, pool_b: 0, pool_draw: 0,
            total_pool: 0, total_bettors: 0, fee_percent: 0,
            stats_api_match_id: m.id,
          });
          betByMatchId[matchRecord.id] = bet;
        }

        // Fetch live odds from API
        try {
          const oddsRes = await fetch(`https://api.thestatsapi.com/api/football/matches/${m.id}/odds`, {
            headers: { Authorization: `Bearer ${API_KEY}` },
          });
          if (oddsRes.ok) {
            const oddsData = await oddsRes.json();
            const bookmakers = oddsData?.data?.bookmakers || [];
            const bm = bookmakers.find(b => b.bookmaker === 'Pinnacle') || bookmakers[0];
            if (bm) {
              const mo = bm.markets?.match_odds;
              if (mo) {
                const oddsA = parseFloat(mo.home?.last_seen || mo.home?.opening || 0);
                const oddsB = parseFloat(mo.away?.last_seen || mo.away?.opening || 0);
                const oddsDraw = parseFloat(mo.draw?.last_seen || mo.draw?.opening || 0);
                if (oddsA > 0) {
                  await base44.asServiceRole.entities.Bet.update(bet.id, {
                    odds_a: oddsA,
                    odds_b: oddsB,
                    odds_draw: oddsDraw,
                    odds_bookmaker: bm.bookmaker,
                    odds_updated_at: new Date().toISOString(),
                  });
                  oddsUpdated++;
                }
              }
            }
          }
        } catch (_) {
          // odds not available yet, skip
        }
      }
    }

    return Response.json({
      success: true,
      message: `Sync complete: ${created} new matches created, ${oddsUpdated} with live odds, ${skipped} already existed.`,
      created,
      oddsUpdated,
      skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});