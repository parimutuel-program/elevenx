import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Debug: Check connected wallet vs platform admin
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get wallet user data
    const walletUsers = await base44.entities.WalletUser.filter({});
    const walletUser = walletUsers.find(w => w.created_by_id === user.id);
    
    return Response.json({
      user_email: user.email,
      user_role: user.role,
      connected_wallet: walletUser?.wallet_address || 'No wallet connected to user',
      platform_admin: 'BfN3J2JGFpHkfSNKP1yhC3JUKDX878RsHZuNBQjXbXDi',
      match: walletUser?.wallet_address === 'BfN3J2JGFpHkfSNKP1yhC3JUKDX878RsHZuNBQjXbXDi',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});