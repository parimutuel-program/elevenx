import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Deploy ALL futures markets from database to Solana
 * Returns first transaction instruction for user to sign
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Support both platform auth and wallet-based auth
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') isAdmin = true;
    } catch (_) {}

    if (!isAdmin) {
      try {
        const authHeader = req.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');
        if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.walletAddress) {
              const walletUsers = await base44.asServiceRole.entities.WalletUser.filter({ wallet_address: payload.walletAddress });
              if (walletUsers[0]?.role === 'admin') isAdmin = true;
            }
          }
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[deployAllFutures] Starting deployment...');

    // Get all futures markets
    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.filter({});
    
    // Find markets not marked as deployed
    const marketsNotMarkedDeployed = allMarkets.filter(m => !m.solana_market_created);

    console.log(`[deployAllFutures] Found ${marketsNotMarkedDeployed.length} markets not marked as deployed out of ${allMarkets.length} total`);

    // If all are marked deployed, verify on-chain status
    if (marketsNotMarkedDeployed.length === 0) {
      console.log('[deployAllFutures] All markets marked deployed, verifying on-chain...');
      let needsRedeployment = false;
      let redeployCount = 0;
      
      for (const market of allMarkets) {
        if (market.solana_market_pda) {
          try {
            const statusRes = await base44.functions.invoke('checkFuturesMarketStatus', {
              futures_market_id: market.id,
            });
            
            if (statusRes.data.error || !statusRes.data.exists) {
              console.log(`[deployAllFutures] Market missing on-chain: ${market.id}`);
              needsRedeployment = true;
              redeployCount++;
              await base44.asServiceRole.entities.FuturesMarket.update(market.id, {
                solana_market_created: false,
              });
            }
          } catch (err) {
            console.log(`[deployAllFutures] Failed to verify ${market.id}:`, err.message);
            needsRedeployment = true;
            redeployCount++;
          }
        }
      }
      
      if (needsRedeployment) {
        console.log(`[deployAllFutures] Found ${redeployCount} markets need redeployment`);
        const updatedMarkets = await base44.asServiceRole.entities.FuturesMarket.filter({});
        const marketsToDeploy = updatedMarkets.filter(m => !m.solana_market_created);
        const firstMarket = marketsToDeploy[0];
        const remaining = marketsToDeploy.length - 1;
        
        const res = await base44.functions.invoke('createFuturesMarketOnChain', {
          futures_market_id: firstMarket.id,
        });
        
        if (res.data.error) throw new Error(res.data.error);
        
        return Response.json({
          success: true,
          message: `Found ${redeployCount} markets missing on-chain. Deploying first...`,
          remaining: remaining,
          needsSigning: true,
          solana_instruction: res.data.solana_instruction,
          market_id: firstMarket.id,
        });
      }
      
      return Response.json({ 
        success: true,
        message: `✓ All ${allMarkets.length} futures verified on-chain`,
        total: allMarkets.length,
        deployed: allMarkets.length,
        verified: true,
      });
    }
    
    const marketsToDeploy = marketsNotMarkedDeployed;

    // Deploy first market and return instruction for signing
    const firstMarket = marketsToDeploy[0];
    const remaining = marketsToDeploy.length - 1;

    try {
      const res = await base44.functions.invoke('createFuturesMarketOnChain', {
        futures_market_id: firstMarket.id,
      });

      if (res.data.error) {
        console.error('[deployAllFutures] createFuturesMarketOnChain error:', res.data.error);
        // Provide helpful context for common errors
        if (res.data.error.includes('Platform not initialized') || res.data.error.includes('platform_config')) {
          throw new Error('Platform not initialized on Solana. Go to Platform tab and click "Init Platform" first.');
        }
        if (res.data.error.includes('missing') || res.data.error.includes('Account')) {
          throw new Error(`On-chain account error: ${res.data.error}. Try fixing timestamps or reinitializing platform.`);
        }
        throw new Error(res.data.error);
      }

      // If already exists, skip to next
      if (res.data.alreadyExists) {
        await base44.asServiceRole.entities.FuturesMarket.update(firstMarket.id, {
          solana_market_created: true,
          solana_market_pda: res.data.marketPda || firstMarket.solana_market_pda,
        });
        console.log(`[deployAllFutures] ✓ Already exists: ${firstMarket.country}`);
        
        // Return next market to deploy
        return Response.json({
          success: true,
          message: `Market already deployed. ${remaining} remaining`,
          remaining: remaining,
          needsSigning: false,
          autoContinue: true,
        });
      }

      console.log(`[deployAllFutures] Ready to deploy: ${firstMarket.country}`);

      return Response.json({
        success: true,
        message: `Sign to deploy ${firstMarket.country || firstMarket.title}. ${remaining} remaining after this.`,
        remaining: remaining,
        needsSigning: true,
        solana_instruction: res.data.solana_instruction,
        market_id: firstMarket.id,
      });

    } catch (err) {
      console.error(`[deployAllFutures] ✗ Failed ${firstMarket.id}:`, err);
      return Response.json({
        success: false,
        error: err.message,
        market_id: firstMarket.id,
      });
    }

  } catch (error) {
    console.error('deployAllFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});