import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Deploy ALL futures markets from database to Solana
 * Creates on-chain markets for all futures in the database
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[deployAllFutures] Starting deployment...');

    // Get all futures markets
    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.filter({});
    const marketsToDeploy = allMarkets.filter(m => !m.solana_market_created);

    console.log(`[deployAllFutures] Found ${marketsToDeploy.length} markets to deploy out of ${allMarkets.length} total`);

    if (marketsToDeploy.length === 0) {
      return Response.json({ 
        success: true,
        message: 'All futures already deployed',
        total: allMarkets.length,
        deployed: allMarkets.filter(m => m.solana_market_created).length,
      });
    }

    // Deploy each market
    let deployed = 0;
    let failed = 0;
    const errors = [];

    for (const market of marketsToDeploy) {
      try {
        const res = await base44.functions.invoke('createFuturesMarketOnChain', {
          market_id: market.id,
        });

        if (res.data.error) {
          failed++;
          errors.push(`${market.id}: ${res.data.error}`);
          continue;
        }

        // Update market record
        await base44.asServiceRole.entities.FuturesMarket.update(market.id, {
          solana_market_created: true,
          solana_market_pda: res.data.marketPda || market.solana_market_pda,
        });

        deployed++;
        console.log(`[deployAllFutures] ✓ Deployed: ${market.country}`);
      } catch (err) {
        failed++;
        errors.push(`${market.id}: ${err.message}`);
        console.error(`[deployAllFutures] ✗ Failed ${market.id}:`, err);
      }
    }

    console.log(`[deployAllFutures] Complete: ${deployed} deployed, ${failed} failed`);

    return Response.json({
      success: true,
      message: `✓ Deployed ${deployed} futures markets (${failed} failed)`,
      deployed,
      failed,
      total: marketsToDeploy.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });

  } catch (error) {
    console.error('deployAllFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});