import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Admin-only: Fix all stuck 'won' bets by marking them as 'claimed'
 * Scans for bets with status='won' and updates them using service role
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    console.log('[fixStuckClaims] Starting migration...');

    // Get all user bets with status 'won'
    const allUserBets = await base44.asServiceRole.entities.UserBet.list();
    const stuckBets = allUserBets.filter(ub => ub.status === 'won');

    console.log('[fixStuckClaims] Found', stuckBets.length, 'stuck bets');

    if (stuckBets.length === 0) {
      return Response.json({
        success: true,
        message: 'No stuck bets found',
        fixed: 0,
      });
    }

    // Update all stuck bets to 'claimed'
    const fixed = [];
    const errors = [];

    for (const bet of stuckBets) {
      try {
        await base44.asServiceRole.entities.UserBet.update(bet.id, {
          status: 'claimed',
          actual_payout: bet.potential_payout || bet.amount || 0,
        });
        fixed.push({
          id: bet.id,
          wallet: bet.wallet_address,
          amount: bet.amount,
          payout: bet.potential_payout,
        });
        console.log('[fixStuckClaims] ✓ Fixed:', bet.id);
      } catch (err) {
        errors.push({ id: bet.id, error: err.message });
        console.error('[fixStuckClaims] ✗ Failed:', bet.id, err.message);
      }
    }

    console.log(`[fixStuckClaims] Complete: ${fixed.length} fixed, ${errors.length} errors`);

    return Response.json({
      success: true,
      message: `Fixed ${fixed.length} stuck bets`,
      fixed,
      errors,
      summary: {
        total: stuckBets.length,
        fixed: fixed.length,
        failed: errors.length,
      },
    });

  } catch (error) {
    console.error('fixStuckClaims error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});