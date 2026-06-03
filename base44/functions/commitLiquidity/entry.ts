import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';

/**
 * Commit liquidity to database AFTER transaction succeeds on-chain.
 * Called by frontend after wallet signs and confirms the transaction.
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
    
    // Verify transaction actually succeeded on-chain
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const confirmation = await connection.getSignatureStatus(signature);
    
    if (!confirmation || !confirmation.value || confirmation.value.err) {
      console.error('[commitLiquidity] Transaction failed on-chain:', confirmation);
      return Response.json({ 
        error: 'Transaction not confirmed on-chain',
        debug: confirmation,
      }, { status: 400 });
    }
    
    console.log('[commitLiquidity] ✓ Transaction verified on-chain:', signature);
    
    // Commit BetOffer
    const { offer, userBet, lpField, amount } = commit_data;
    
    // Check if existing offer exists (same LP, same outcome)
    const existingOffers = await serviceRole.entities.BetOffer.filter({
      bet_id: offer.bet_id,
      lp_wallet_address: offer.lp_wallet_address,
      outcome: offer.outcome,
    });
    
    let offerId;
    if (existingOffers.length > 0) {
      // Update existing offer
      const existingOffer = existingOffers[0];
      await serviceRole.entities.BetOffer.update(existingOffer.id, {
        amount_offered: (existingOffer.amount_offered || 0) + offer.amount_offered,
        amount_unmatched: (existingOffer.amount_unmatched || 0) + offer.amount_unmatched,
      });
      offerId = existingOffer.id;
      console.log('[commitLiquidity] Updated existing BetOffer:', offerId);
    } else {
      // Create new offer
      const newOffer = await serviceRole.entities.BetOffer.create(offer);
      offerId = newOffer.id;
      console.log('[commitLiquidity] Created new BetOffer:', offerId);
    }
    
    // Commit UserBet
    const newUserBet = await serviceRole.entities.UserBet.create({
      ...userBet,
      offer_id: offerId,
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