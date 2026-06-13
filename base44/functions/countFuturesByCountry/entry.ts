import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.list();
    
    // Group by country
    const countryCount = {};
    const duplicates = [];
    
    allMarkets.forEach(m => {
      if (!countryCount[m.country]) {
        countryCount[m.country] = [];
      }
      countryCount[m.country].push({ id: m.id, title: m.title });
      
      if (countryCount[m.country].length > 1) {
        duplicates.push(m.country);
      }
    });
    
    console.log('[countFuturesByCountry] Total markets:', allMarkets.length);
    console.log('[countFuturesByCountry] Unique countries:', Object.keys(countryCount).length);
    console.log('[countFuturesByCountry] Duplicates:', duplicates);
    
    // Show countries with duplicates
    const dupDetails = duplicates.map(country => ({
      country,
      count: countryCount[country].length,
      markets: countryCount[country],
    }));

    return Response.json({
      total: allMarkets.length,
      unique_countries: Object.keys(countryCount).length,
      duplicates: dupDetails,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});