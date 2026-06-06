import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const serviceRole = base44.asServiceRole;
    
    // List all UserBets with wallet info
    const allBets = await serviceRole.entities.UserBet.list();
    
    const uniqueWallets = [...new Set(allBets.map(b => b.wallet_address))];
    
    return Response.json({
      totalBets: allBets.length,
      uniqueWalletsWithBets: uniqueWallets.length,
      wallets: uniqueWallets.map(wallet => ({
        wallet,
        betCount: allBets.filter(b => b.wallet_address === wallet).length,
        bets: allBets.filter(b => b.wallet_address === wallet).map(b => ({
          id: b.id,
          amount: b.amount,
          status: b.status,
          outcome: b.outcome,
          match_id: b.match_id,
        })),
      })),
    });
    
  } catch (error) {
    console.error('whichWalletHasBets error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});