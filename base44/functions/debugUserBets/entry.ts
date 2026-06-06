import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceRole = base44.asServiceRole;
    
    // Get all UserBets for this wallet
    const allBets = await serviceRole.entities.UserBet.list();
    
    const userBets = allBets.filter(b => b.wallet_address === user.wallet_address);
    
    return Response.json({
      currentUser: {
        id: user.id,
        wallet_address: user.wallet_address,
        email: user.email,
        role: user.role,
      },
      totalBetsInDB: allBets.length,
      myBets: userBets.length,
      myBetsData: userBets.map(b => ({
        id: b.id,
        match_id: b.match_id,
        outcome: b.outcome,
        amount: b.amount,
        status: b.status,
        wallet_address: b.wallet_address,
        created_date: b.created_date,
      })),
    });
    
  } catch (error) {
    console.error('debugUserBets error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});