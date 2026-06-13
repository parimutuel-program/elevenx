import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Remove futures markets for countries not in the real 2026 World Cup
 * Real participants: 48 teams across 12 groups
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Official 48 World Cup 2026 countries
    const validCountries = new Set([
      // Group A
      'Canada', 'France', 'South Korea', 'Tunisia',
      // Group B
      'England', 'Iran', 'Senegal', 'USA',
      // Group C
      'Denmark', 'Greece', 'Italy', 'Jamaica',
      // Group D
      'Australia', 'Honduras', 'Nigeria', 'Spain',
      // Group E
      'Brazil', 'Colombia', 'New Zealand', 'South Africa',
      // Group F
      'Germany', 'Japan', 'Paraguay', 'Ukraine',
      // Group G
      'Argentina', 'Croatia', 'Morocco', 'Saudi Arabia',
      // Group H
      'Belgium', 'Cameroon', 'Portugal', 'Serbia',
      // Group I
      'China', 'Mexico', 'Netherlands', 'Uruguay',
      // Group J
      'Austria', 'Egypt', 'Poland', 'Switzerland',
      // Group K
      'Chile', 'Costa Rica', 'Ivory Coast', 'Sweden',
      // Group L
      'Ecuador', 'India', 'Norway', 'Turkey',
    ]);

    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.list();
    
    // Find markets with invalid countries
    const invalidMarkets = allMarkets.filter(m => !validCountries.has(m.country));
    
    console.log('[removeInvalidCountries] Invalid markets to delete:', invalidMarkets.length);
    invalidMarkets.forEach(m => {
      console.log(`  - ${m.country}: ${m.title}`);
    });

    // Delete invalid markets
    let deleted = 0;
    for (const market of invalidMarkets) {
      try {
        await base44.asServiceRole.entities.FuturesMarket.delete(market.id);
        console.log(`✓ Deleted: ${market.country}`);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete ${market.id}:`, err.message);
      }
    }

    const remaining = allMarkets.length - deleted;
    
    return Response.json({
      success: true,
      message: `✓ Deleted ${deleted} invalid country markets. ${remaining} valid markets remaining (48 expected).`,
      deleted,
      remaining,
      invalid_markets: invalidMarkets.map(m => ({ country: m.country, title: m.title })),
    });

  } catch (error) {
    console.error('removeInvalidCountries error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});