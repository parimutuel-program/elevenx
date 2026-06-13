import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Create missing futures markets for all 48 World Cup countries
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[createMissingFutures] Starting...');

    // All 48 World Cup 2026 countries with flags
    const allCountries = [
      // Group A
      { name: 'Canada', flag: '🇨🇦', odds: [200, 100, 60] },
      { name: 'France', flag: '🇫🇷', odds: [12, 6, 3.6] },
      { name: 'South Korea', flag: '🇰🇷', odds: [150, 75, 45] },
      { name: 'Tunisia', flag: '🇹🇳', odds: [250, 125, 75] },
      // Group B
      { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: [9, 4.5, 2.7] },
      { name: 'Iran', flag: '🇮🇷', odds: [300, 150, 90] },
      { name: 'Senegal', flag: '🇸🇳', odds: [180, 90, 54] },
      { name: 'USA', flag: '🇺🇸', odds: [50, 25, 15] },
      // Group C
      { name: 'Denmark', flag: '🇩🇰', odds: [120, 60, 36] },
      { name: 'Greece', flag: '🇬🇷', odds: [250, 125, 75] },
      { name: 'Italy', flag: '🇮🇹', odds: [17, 8.5, 5.1] },
      { name: 'Jamaica', flag: '🇯🇲', odds: [350, 175, 105] },
      // Group D
      { name: 'Australia', flag: '🇦🇺', odds: [150, 75, 45] },
      { name: 'Honduras', flag: '🇭🇳', odds: [400, 200, 120] },
      { name: 'Nigeria', flag: '🇳🇬', odds: [200, 100, 60] },
      { name: 'Spain', flag: '🇪🇸', odds: [9, 4.5, 2.7] },
      // Group E
      { name: 'Brazil', flag: '🇧🇷', odds: [5, 2.5, 1.5] },
      { name: 'Colombia', flag: '🇨🇴', odds: [80, 40, 24] },
      { name: 'New Zealand', flag: '🇳🇿', odds: [300, 150, 90] },
      { name: 'South Africa', flag: '🇿🇦', odds: [250, 125, 75] },
      // Group F
      { name: 'Germany', flag: '🇩🇪', odds: [10, 5, 3] },
      { name: 'Japan', flag: '🇯🇵', odds: [80, 40, 24] },
      { name: 'Paraguay', flag: '🇵🇾', odds: [200, 100, 60] },
      { name: 'Ukraine', flag: '🇺🇦', odds: [180, 90, 54] },
      // Group G
      { name: 'Argentina', flag: '🇦🇷', odds: [6, 3, 1.8] },
      { name: 'Croatia', flag: '🇭🇷', odds: [60, 30, 18] },
      { name: 'Morocco', flag: '🇲🇦', odds: [100, 50, 30] },
      { name: 'Saudi Arabia', flag: '🇸🇦', odds: [300, 150, 90] },
      // Group H
      { name: 'Belgium', flag: '🇧🇪', odds: [15, 7.5, 4.5] },
      { name: 'Cameroon', flag: '🇨🇲', odds: [250, 125, 75] },
      { name: 'Portugal', flag: '🇵🇹', odds: [11, 5.5, 3.3] },
      { name: 'Serbia', flag: '🇷🇸', odds: [180, 90, 54] },
      // Group I
      { name: 'China', flag: '🇨🇳', odds: [400, 200, 120] },
      { name: 'Mexico', flag: '🇲🇽', odds: [60, 30, 18] },
      { name: 'Netherlands', flag: '🇳🇱', odds: [13, 6.5, 3.9] },
      { name: 'Uruguay', flag: '🇺🇾', odds: [40, 20, 12] },
      // Group J
      { name: 'Austria', flag: '🇦🇹', odds: [150, 75, 45] },
      { name: 'Egypt', flag: '🇪🇬', odds: [250, 125, 75] },
      { name: 'Poland', flag: '🇵🇱', odds: [180, 90, 54] },
      { name: 'Switzerland', flag: '🇨🇭', odds: [100, 50, 30] },
      // Group K
      { name: 'Chile', flag: '🇨🇱', odds: [180, 90, 54] },
      { name: 'Costa Rica', flag: '🇨🇷', odds: [300, 150, 90] },
      { name: 'Ivory Coast', flag: '🇨🇮', odds: [250, 125, 75] },
      { name: 'Sweden', flag: '🇸🇪', odds: [120, 60, 36] },
      // Group L
      { name: 'Ecuador', flag: '🇪🇨', odds: [200, 100, 60] },
      { name: 'India', flag: '🇮🇳', odds: [500, 250, 150] },
      { name: 'Norway', flag: '🇳🇴', odds: [150, 75, 45] },
      { name: 'Turkey', flag: '🇹🇷', odds: [180, 90, 54] },
    ];

    // Get existing markets
    const existingMarkets = await base44.asServiceRole.entities.FuturesMarket.list();
    const existingCountries = new Set(existingMarkets.map(m => m.country));
    
    console.log('[createMissingFutures] Existing countries:', existingCountries.size);

    let created = 0;
    let skipped = 0;

    // Create markets for missing countries
    for (const country of allCountries) {
      if (existingCountries.has(country.name)) {
        console.log(`[createMissingFutures] ⊘ Skip: ${country.name} (exists)`);
        skipped++;
        continue;
      }

      const market = {
        title: `${country.name} World Cup Finish`,
        subtitle: `Where will ${country.name} finish?`,
        category: 'tournament',
        country: country.name,
        country_flag: country.flag,
        icon: country.flag,
        status: 'open',
        open_until: '2026-07-19T19:00:00Z',
        outcomes: [
          { 
            label: `${country.name} - 1st Place`, 
            position: '1st', 
            flag: country.flag, 
            odds: country.odds[0], 
            pool: 0, 
            lp_offers: 0 
          },
          { 
            label: `${country.name} - 2nd Place`, 
            position: '2nd', 
            flag: country.flag, 
            odds: country.odds[1], 
            pool: 0, 
            lp_offers: 0 
          },
          { 
            label: `${country.name} - 3rd Place`, 
            position: '3rd', 
            flag: country.flag, 
            odds: country.odds[2], 
            pool: 0, 
            lp_offers: 0 
          },
        ],
        total_volume: 0,
        solana_market_created: false,
        solana_market_pda: '',
        winning_outcome: '',
        winning_outcome_label: '',
        group: `Group ${String.fromCharCode(65 + allCountries.indexOf(country))}`,
      };

      await base44.asServiceRole.entities.FuturesMarket.create(market);
      created++;
      console.log(`[createMissingFutures] ✓ Created: ${country.name}`);
    }

    console.log(`[createMissingFutures] ✓ Complete! Created ${created}, skipped ${skipped}`);

    return Response.json({
      success: true,
      message: `✓ Created ${created} missing futures markets! (Skipped ${skipped} existing)`,
      created,
      skipped,
      total: created + skipped,
    });

  } catch (error) {
    console.error('createMissingFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});