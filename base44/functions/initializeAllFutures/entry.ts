import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Initialize ALL futures markets on Solana
 * Creates on-chain market accounts for all futures in database
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[initializeAllFutures] Starting initialization...');

    // Get all futures markets (both open and coming_soon)
    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.filter({});
    const marketsToInit = allMarkets.filter(m => !m.solana_market_created || m.status === 'coming_soon');

    console.log(`[initializeAllFutures] Found ${marketsToInit.length} markets to initialize`);

    if (marketsToInit.length === 0) {
      return Response.json({ 
        success: true,
        message: 'All futures already initialized',
        total: allMarkets.length,
      });
    }

    // Initialize each market
    let initialized = 0;
    let failed = 0;
    const errors = [];

    for (const market of marketsToInit) {
      try {
        const res = await base44.functions.invoke('createFuturesMarketOnChain', {
          market_id: market.id,
          force_recreate: false,
        });

        if (res.data.error) {
          failed++;
          errors.push(`${market.id}: ${res.data.error}`);
          continue;
        }

        // Update market record
        await base44.asServiceRole.entities.FuturesMarket.update(market.id, {
          solana_market_created: true,
          solana_market_pda: res.data.marketPda,
          status: 'open',
        });

        initialized++;
        console.log(`[initializeAllFutures] ✓ Initialized: ${market.country}`);
      } catch (err) {
        failed++;
        errors.push(`${market.id}: ${err.message}`);
        console.error(`[initializeAllFutures] ✗ Failed ${market.id}:`, err);
      }
    }

    console.log(`[initializeAllFutures] Complete: ${initialized} initialized, ${failed} failed`);

    return Response.json({
      success: true,
      message: `✓ Initialized ${initialized} futures markets (${failed} failed)`,
      initialized,
      failed,
      total: marketsToInit.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });

  } catch (error) {
    console.error('initializeAllFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});