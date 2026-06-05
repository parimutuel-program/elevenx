import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Reset a specific UserBet from "claimed" back to "won" so user can claim again after proper on-chain settlement.
 * Admin-only function.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const { userBetId, admin_wallet } = await req.json();

    if (!admin_wallet) {
      return Response.json({ error: 'admin_wallet required' }, { status: 400 });
    }

    // Verify admin
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: admin_wallet });
    const walletUser = walletUsers[0];
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!userBetId) {
      return Response.json({ error: 'userBetId required' }, { status: 400 });
    }

    const userBet = await serviceRole.entities.UserBet.get(userBetId);
    if (!userBet) {
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    console.log('[resetUserBetClaim] Resetting bet:', userBetId, 'from', userBet.status, '→ won');

    // Reset status back to "won" so user can claim again
    await serviceRole.entities.UserBet.update(userBetId, {
      status: 'won',
      actual_payout: userBet.potential_payout || 0,
    });

    return Response.json({
      success: true,
      message: `✓ UserBet ${userBetId} reset from "${userBet.status}" to "won". User can now claim properly.`,
      userBet: {
        id: userBet.id,
        match_id: userBet.match_id,
        amount: userBet.amount,
        potential_payout: userBet.potential_payout,
      },
    });

  } catch (error) {
    console.error('resetUserBetClaim error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});