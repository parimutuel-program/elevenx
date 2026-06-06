import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const serviceRole = base44.asServiceRole;
    
    // Check specific wallet
    const targetWallet = '6Bp5RhK8KqcxNmqKEFzNqJ3h8M5vR2wQ9pLxTcYdZjXh';
    
    const allBets = await serviceRole.entities.UserBet.list();
    const walletBets = allBets.filter(b => b.wallet_address === targetWallet);
    
    // Check User entity for this wallet
    const users = await serviceRole.entities.User.filter({ wallet_address: targetWallet });
    
    // Check WalletUser entity
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: targetWallet });
    
    return Response.json({
      targetWallet,
      usersFound: users.length,
      walletUsersFound: walletUsers.length,
      totalBetsInDB: allBets.length,
      betsForTargetWallet: walletBets.length,
      betsData: walletBets.map(b => ({
        id: b.id,
        match_id: b.match_id,
        outcome: b.outcome,
        amount: b.amount,
        status: b.status,
        wallet_address: b.wallet_address,
        created_date: b.created_date,
      })),
      userData: users.map(u => ({ id: u.id, wallet_address: u.wallet_address, email: u.email })),
      walletUserData: walletUsers.map(wu => ({ id: wu.id, wallet_address: wu.wallet_address, username: wu.username })),
    });
    
  } catch (error) {
    console.error('checkWalletBets error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});