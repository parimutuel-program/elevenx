import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Initialize ALL match markets on Solana
 * Creates on-chain market accounts for all matches in database
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[initializeAllMatches] Starting initialization...');

    // Get all bets
    const allBets = await base44.asServiceRole.entities.Bet.filter({});
    const betsToInit = allBets.filter(b => !b.solana_market_created);

    console.log(`[initializeAllMatches] Found ${betsToInit.length} bets to initialize`);

    if (betsToInit.length === 0) {
      return Response.json({ 
        success: true,
        message: 'All matches already initialized',
        total: allBets.length,
      });
    }

    // Initialize each market
    let initialized = 0;
    let failed = 0;
    const errors = [];

    for (const bet of betsToInit) {
      try {
        const res = await base44.functions.invoke('createMarketOnChain', {
          bet_id: bet.id,
          force_recreate: false,
        });

        if (res.data.error) {
          failed++;
          errors.push(`${bet.id}: ${res.data.error}`);
          continue;
        }

        // Update bet record
        await base44.asServiceRole.entities.Bet.update(bet.id, {
          solana_market_created: true,
          solana_market_pda: res.data.marketPda,
        });

        initialized++;
        console.log(`[initializeAllMatches] ✓ Initialized: ${bet.title}`);
      } catch (err) {
        failed++;
        errors.push(`${bet.id}: ${err.message}`);
        console.error(`[initializeAllMatches] ✗ Failed ${bet.id}:`, err);
      }
    }

    console.log(`[initializeAllMatches] Complete: ${initialized} initialized, ${failed} failed`);

    return Response.json({
      success: true,
      message: `✓ Initialized ${initialized} match markets (${failed} failed)`,
      initialized,
      failed,
      total: betsToInit.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });

  } catch (error) {
    console.error('initializeAllMatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});