import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Admin function to fix cancelled BetOffers by resetting their status to 'open'.
 * Call this when an LP wants to reactivate a previously cancelled offer.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }
    
    const payload = await req.json();
    const { bet_id, outcome } = payload;
    
    if (!bet_id || !outcome) {
      return Response.json({ error: 'Missing bet_id or outcome' }, { status: 400 });
    }
    
    // Find all cancelled offers for this bet and outcome
    const cancelledOffers = await base44.asServiceRole.entities.BetOffer.filter({
      bet_id,
      outcome,
      status: 'cancelled',
    });
    
    if (cancelledOffers.length === 0) {
      return Response.json({ 
        error: 'No cancelled offers found',
        bet_id,
        outcome,
      }, { status: 404 });
    }
    
    // Reset all cancelled offers to 'open'
    let updated = 0;
    for (const offer of cancelledOffers) {
      await base44.asServiceRole.entities.BetOffer.update(offer.id, {
        status: 'open',
      });
      updated++;
      console.log(`[fixCancelledOffer] Reset offer ${offer.id.slice(0, 8)}... to 'open'`);
    }
    
    return Response.json({
      success: true,
      message: `✓ Fixed ${updated} cancelled offer(s)`,
      updated_count: updated,
      bet_id,
      outcome,
    });
    
  } catch (error) {
    console.error('[fixCancelledOffer] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});