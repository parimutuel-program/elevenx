import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Called client-side AFTER a create_market transaction is confirmed on-chain.
 * Sets solana_market_created: true and solana_market_pda on the Bet entity.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: Check platform user OR wallet JWT
    let walletAddress = null;
    
    // Try platform auth first
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') {
        // Platform admin - proceed
      } else {
        throw new Error('Not platform admin');
      }
    } catch (_) {
      // No platform auth - try wallet JWT
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      
      if (token && token.split('.').length === 3) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          walletAddress = payload.walletAddress;
        } catch (_) {}
      }
      
      if (!walletAddress) {
        return Response.json({ error: 'Authentication required' }, { status: 403 });
      }
    }
    
    // Verify admin status using service role
    if (walletAddress) {
      const walletUsers = await base44.asServiceRole.entities.WalletUser.filter({ wallet_address: walletAddress });
      if (!walletUsers[0] || walletUsers[0].role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    }

    const body = await req.json();
    const { bet_id, market_pda, match_id } = body;

    if (!bet_id || !market_pda) {
      return Response.json({ error: 'Missing bet_id or market_pda' }, { status: 400 });
    }

    const updateData = {
      solana_market_created: true,
      solana_market_pda: market_pda,
    };
    
    // Atomic match_id update (for _v2 collision resolution)
    if (match_id) {
      updateData.match_id = match_id;
    }

    await base44.asServiceRole.entities.Bet.update(bet_id, updateData);

    console.log(`[commitMarketDeployment] ✓ Bet ${bet_id} marked deployed: ${market_pda}`);

    return Response.json({ success: true, bet_id, market_pda });
  } catch (error) {
    console.error('[commitMarketDeployment] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});