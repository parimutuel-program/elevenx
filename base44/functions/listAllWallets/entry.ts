import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const serviceRole = base44.asServiceRole;
    
    // List all WalletUsers
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    
    // List all Users with wallet_address
    const allUsers = await serviceRole.entities.User.list();
    const usersWithWallet = allUsers.filter(u => u.wallet_address);
    
    // List all UserBets grouped by wallet
    const allBets = await serviceRole.entities.UserBet.list();
    const betsByWallet = {};
    for (const bet of allBets) {
      const wallet = bet.wallet_address;
      if (!betsByWallet[wallet]) {
        betsByWallet[wallet] = [];
      }
      betsByWallet[wallet].push(bet);
    }
    
    return Response.json({
      totalWalletUsers: allWalletUsers.length,
      walletUsers: allWalletUsers.map(wu => ({
        id: wu.id,
        wallet_address: wu.wallet_address,
        username: wu.username,
        created_date: wu.created_date,
      })),
      totalUsersWithWallet: usersWithWallet.length,
      usersWithWallet: usersWithWallet.map(u => ({
        id: u.id,
        wallet_address: u.wallet_address,
        email: u.email,
        username: u.username,
        created_date: u.created_date,
      })),
      totalBets: allBets.length,
      betsByWallet: Object.entries(betsByWallet).map(([wallet, bets]) => ({
        wallet,
        betCount: bets.length,
        bets: bets.map(b => ({ id: b.id, amount: b.amount, status: b.status, outcome: b.outcome })),
      })),
    });
    
  } catch (error) {
    console.error('listAllWallets error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});