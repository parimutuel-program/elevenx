import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Commit liquidity to database AFTER transaction succeeds on-chain.
 * Called by frontend after wallet signs and confirms the transaction.
 * Note: on-chain verification already done by frontend before calling this.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const { signature, commit_data } = payload;
    
    if (!signature || !commit_data) {
      return Response.json({ error: 'Missing signature or commit_data' }, { status: 400 });
    }
    
    console.log('[commitLiquidity] Committing liquidity for signature:', signature.slice(0, 20) + '...');
    
    // Commit BetOffer
    const { offer, userBet } = commit_data;
    const outcomeMap = { a: 'pool_a', b: 'pool_b', draw: 'pool_draw' };
    const lpField = outcomeMap[offer.outcome] || 'pool_a';
    const amount = offer.amount_offered;
    
    // Check if existing offer exists (same LP, same outcome)
    const existingOffers = await serviceRole.entities.BetOffer.filter({
      bet_id: offer.bet_id,
      lp_wallet_address: offer.lp_wallet_address,
      outcome: offer.outcome,
    });
    
    let offerId;
    if (existingOffers.length > 0) {
      // Update existing offer - recalculate status based on new unmatched amount
      const existingOffer = existingOffers[0];
      const newAmountUnmatched = (existingOffer.amount_unmatched || 0) + offer.amount_unmatched;
      const newStatus = newAmountUnmatched <= 0.0001 ? 'fully_matched' : 'open';
      
      // CRITICAL: Always update PDAs to ensure on-chain verification works
      const updateData = {
        amount_offered: (existingOffer.amount_offered || 0) + offer.amount_offered,
        amount_unmatched: newAmountUnmatched,
        status: newStatus,
      };
      
      // Update PDAs if provided (for backwards compatibility with old offers)
      if (offer.solana_bet_pool_pda) {
        updateData.solana_bet_pool_pda = offer.solana_bet_pool_pda;
      }
      if (offer.solana_position_pda) {
        updateData.solana_position_pda = offer.solana_position_pda;
      }
      
      await serviceRole.entities.BetOffer.update(existingOffer.id, updateData);
      offerId = existingOffer.id;
      console.log('[commitLiquidity] Updated existing BetOffer:', offerId, 'status:', newStatus, 'unmatched:', newAmountUnmatched, 'pda_updated:', !!offer.solana_position_pda);
    } else {
      // Create new offer with status 'open'
      const newOffer = await serviceRole.entities.BetOffer.create({
        ...offer,
        status: 'open',
      });
      offerId = newOffer.id;
      console.log('[commitLiquidity] Created new BetOffer:', offerId, 'status: open, has PDA:', !!offer.solana_position_pda);
    }
    
    // Commit UserBet for LP position (fixed odds betting)
    const newUserBet = await serviceRole.entities.UserBet.create({
      ...userBet,
      offer_id: offerId,
      role: 'lp', // Fixed odds LP position
      // Ensure LP fields are set
      liquidity_deposited: userBet.liquidity_deposited || userBet.amount,
      liquidity_matched: userBet.liquidity_matched || 0,
      liquidity_unmatched: userBet.liquidity_unmatched || userBet.amount,
    });
    console.log('[commitLiquidity] Created UserBet:', newUserBet.id);
    
    // Update Bet LP totals
    const bet = await serviceRole.entities.Bet.get(offer.bet_id);
    await serviceRole.entities.Bet.update(offer.bet_id, {
      [lpField]: (bet[lpField] || 0) + amount,
    });
    console.log('[commitLiquidity] Updated Bet LP totals');
    
    return Response.json({
      success: true,
      offerId,
      userBetId: newUserBet.id,
      message: '✓ Liquidity committed to database',
    });
    
  } catch (error) {
    console.error('[commitLiquidity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});