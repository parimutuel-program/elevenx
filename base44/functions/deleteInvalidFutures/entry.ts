import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Delete invalid/duplicate futures markets (World Cup Winner, Golden Boot, Group markets)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[deleteInvalidFutures] Starting...');

    // Get all futures markets
    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.list();
    
    // Find invalid markets to delete
    const marketsToDelete = allMarkets.filter(m => {
      // Delete special markets that don't represent individual countries
      if (m.country === 'World Cup') return true;
      if (m.country === 'Test' && m.title?.includes('Test')) return true;
      // Delete group winner markets (these are not "Where will X finish?" markets)
      if (m.country?.startsWith('Group ') && m.title?.includes('Winner')) return true;
      return false;
    });

    console.log(`[deleteInvalidFutures] Found ${marketsToDelete.length} markets to delete:`);
    marketsToDelete.forEach(m => {
      console.log(`  - ${m.country}: ${m.title}`);
    });

    // Delete them
    let deleted = 0;
    for (const market of marketsToDelete) {
      try {
        await base44.asServiceRole.entities.FuturesMarket.delete(market.id);
        console.log(`[deleteInvalidFutures] ✓ Deleted: ${market.country} - ${market.title}`);
        deleted++;
      } catch (err) {
        console.error(`[deleteInvalidFutures] Failed to delete ${market.id}:`, err.message);
      }
    }

    const remaining = allMarkets.length - deleted;
    console.log(`[deleteInvalidFutures] ✓ Complete! Deleted ${deleted}, ${remaining} remaining`);

    return Response.json({
      success: true,
      message: `✓ Deleted ${deleted} invalid futures markets. ${remaining} valid country markets remaining.`,
      deleted,
      remaining,
      deleted_markets: marketsToDelete.map(m => ({ country: m.country, title: m.title })),
    });

  } catch (error) {
    console.error('deleteInvalidFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});