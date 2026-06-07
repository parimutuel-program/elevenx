import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Deploy ALL match markets from database to Solana
 * Creates on-chain markets for all matches in the database
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[deployAllMatches] Starting deployment...');

    // Get all matches
    const allMatches = await base44.asServiceRole.entities.Match.filter({});
    
    // Get all bets
    const allBets = await base44.asServiceRole.entities.Bet.filter({});
    
    // Find bets that need deployment
    const betsToDeploy = allBets.filter(b => !b.solana_market_created);

    console.log(`[deployAllMatches] Found ${betsToDeploy.length} bets to deploy out of ${allBets.length} total`);

    if (betsToDeploy.length === 0) {
      return Response.json({ 
        success: true,
        message: 'All matches already deployed',
        total: allBets.length,
        deployed: allBets.filter(b => b.solana_market_created).length,
      });
    }

    // Deploy each market
    let deployed = 0;
    let failed = 0;
    const errors = [];

    for (const bet of betsToDeploy) {
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
          solana_market_pda: res.data.marketPda || bet.solana_market_pda,
        });

        deployed++;
        console.log(`[deployAllMatches] ✓ Deployed: ${bet.title}`);
      } catch (err) {
        failed++;
        errors.push(`${bet.id}: ${err.message}`);
        console.error(`[deployAllMatches] ✗ Failed ${bet.id}:`, err);
      }
    }

    console.log(`[deployAllMatches] Complete: ${deployed} deployed, ${failed} failed`);

    return Response.json({
      success: true,
      message: `✓ Deployed ${deployed} match markets (${failed} failed)`,
      deployed,
      failed,
      total: betsToDeploy.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });

  } catch (error) {
    console.error('deployAllMatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});