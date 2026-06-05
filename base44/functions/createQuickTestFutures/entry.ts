import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Create a quick test futures market with immediate settlement capability.
 * Timeline:
 * - NOW: Current time
 * - Betting closes: NOW + 30 minutes
 * - Settlement: Available immediately after betting closes (no delay)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Verify admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date();
    
    // CRITICAL: Betting closes in 30 min, settlement available immediately
    const bettingCloseTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
    const settleAfterTime = bettingCloseTime; // No delay - immediate settlement
    
    // Validate timestamps (for debugging)
    console.log('Timeline:', {
      now_unix: Math.floor(now.getTime() / 1000),
      betting_closes: Math.floor(bettingCloseTime.getTime() / 1000),
      settle_after: Math.floor(settleAfterTime.getTime() / 1000),
      betting_window_seconds: Math.floor((bettingCloseTime.getTime() - now.getTime()) / 1000),
    });

    // Step 1: Create test futures market
    const testFutures = await serviceRole.entities.FuturesMarket.create({
      title: 'Quick Test - Tournament Winner',
      subtitle: 'Test Futures Market',
      category: 'tournament',
      country: 'Test',
      country_flag: '🏆',
      icon: '⚽',
      status: 'open',
      open_until: bettingCloseTime.toISOString(),
      outcomes: [
        {
          label: 'Team Alpha',
          position: '1st',
          flag: '🇺🇸',
          odds: 2.0,
          pool: 0,
          lp_offers: 0,
        },
        {
          label: 'Team Beta',
          position: '2nd',
          flag: '🇧🇷',
          odds: 2.5,
          pool: 0,
          lp_offers: 0,
        },
        {
          label: 'Team Gamma',
          position: '3rd',
          flag: '🇩🇪',
          odds: 3.0,
          pool: 0,
          lp_offers: 0,
        },
      ],
      total_volume: 0,
      solana_market_pda: '',
      solana_market_created: false,
    });

    console.log('[createQuickTestFutures] Created test futures market:', testFutures.id);

    // Step 2: Initialize futures market on-chain
    try {
      const initResult = await base44.functions.invoke('createFuturesMarketOnChain', {
        futures_market_id: testFutures.id,
      });
      console.log('[createQuickTestFutures] Market initialization result:', initResult.data);
    } catch (initErr) {
      console.error('[createQuickTestFutures] Failed to initialize on-chain:', initErr.message);
      // Don't fail the whole flow - user can manually initialize
    }

    return Response.json({
      success: true,
      message: '✓ Quick test futures market created! Betting closes in 30 min, settlement available immediately after.',
      testData: {
        futuresMarketId: testFutures.id,
        bettingCloseTime: bettingCloseTime.toISOString(),
        settleAfterTime: settleAfterTime.toISOString(),
        timeUntilBettingClose: '30 minutes',
      },
      nextSteps: {
        step1: 'Go to /admin > Futures tab and click "Deploy" to create the market on-chain',
        step2: 'Go to /lp > Futures tab to provide liquidity (you\'ll see the test market there)',
        step3: 'Go to /futures to place bets',
        step4: 'Wait 30 minutes, then settle in /admin',
      },
    });

  } catch (error) {
    console.error('[createQuickTestFutures] Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});