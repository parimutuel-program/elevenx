import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Cleanup old withdrawn/refunded LP positions from database
 * Removes UserBet and BetOffer records where on-chain account no longer exists
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[cleanupWithdrawnLp] Starting cleanup of withdrawn LP positions...');

    // Fetch all UserBets with LP role and withdrawn/refunded status
    const allUserBets = await serviceRole.entities.UserBet.list();
    const lpBets = allUserBets.filter(ub => ub.role === 'lp');
    
    console.log('[cleanupWithdrawnLp] Found', lpBets.length, 'LP UserBets');

    let removedCount = 0;
    let updatedCount = 0;

    for (const ub of lpBets) {
      // Skip if already active/claimed
      if (ub.status === 'active' || ub.status === 'pending' || ub.status === 'claimed' || ub.status === 'won') {
        continue;
      }

      // Check if this is a withdrawn/refunded status with no unmatched liquidity
      if (ub.status === 'withdrawn' || ub.status === 'refunded') {
        // Check if there's any unmatched liquidity
        const hasUnmatched = (ub.liquidity_unmatched || 0) > 0 || (ub.liquidity_deposited || 0) > (ub.liquidity_matched || 0);
        
        if (!hasUnmatched) {
          // No liquidity left - safe to delete
          console.log('[cleanupWithdrawnLp] Deleting UserBet', ub.id, '- status:', ub.status, 'no unmatched liquidity');
          await serviceRole.entities.UserBet.delete(ub.id);
          removedCount++;
          
          // Also delete associated BetOffer if exists
          if (ub.offer_id) {
            try {
              const offers = await serviceRole.entities.BetOffer.filter({ id: ub.offer_id });
              if (offers[0]) {
                await serviceRole.entities.BetOffer.delete(ub.offer_id);
                console.log('[cleanupWithdrawnLp] Deleted BetOffer', ub.offer_id);
              }
            } catch (err) {
              console.log('[cleanupWithdrawnLp] BetOffer not found or already deleted:', ub.offer_id);
            }
          }
        } else {
          // Has unmatched liquidity - update status to 'open' so it shows in UI
          console.log('[cleanupWithdrawnLp] Updating UserBet', ub.id, '- has unmatched liquidity:', ub.liquidity_unmatched);
          await serviceRole.entities.UserBet.update(ub.id, {
            status: 'open',
            liquidity_unmatched: ub.liquidity_deposited - ub.liquidity_matched
          });
          updatedCount++;
        }
      }
    }

    // Also cleanup BetOffers with withdrawn status and no unmatched liquidity
    const allOffers = await serviceRole.entities.BetOffer.list();
    for (const offer of allOffers) {
      if (offer.status === 'withdrawn' && (offer.amount_unmatched || 0) <= 0) {
        console.log('[cleanupWithdrawnLp] Deleting BetOffer', offer.id, '- withdrawn, no unmatched');
        await serviceRole.entities.BetOffer.delete(offer.id);
        removedCount++;
      }
    }

    console.log('[cleanupWithdrawnLp] Cleanup complete!');
    console.log('[cleanupWithdrawnLp] Removed:', removedCount, 'records');
    console.log('[cleanupWithdrawnLp] Updated:', updatedCount, 'records');

    return Response.json({
      success: true,
      removedCount,
      updatedCount,
      message: `Cleaned up ${removedCount} withdrawn LP records and updated ${updatedCount} positions with unmatched liquidity`
    });

  } catch (error) {
    console.error('[cleanupWithdrawnLp] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});