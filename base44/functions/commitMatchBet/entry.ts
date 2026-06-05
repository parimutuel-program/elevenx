import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection } from 'npm:@solana/web3.js@1.98.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const { signature, commit_data } = payload;
    
    if (!signature || !commit_data) {
      return Response.json({ error: 'Missing signature or commit_data' }, { status: 400 });
    }
    
    // Support both old format (offer, userBet, lpField, amount) and new format (userBet, offerUpdate, betUpdate)
    const { offer, userBet, lpField, amount, offerUpdate, betUpdate } = commit_data;
    
    // Verify transaction exists on-chain with retry loop for Devnet RPC lag
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    let tx = null;
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
        if (tx) {
          console.log(`[commitMatchBet] Transaction verified on-chain after ${attempt + 1} attempts:`, signature);
          break;
        }
        console.log(`[commitMatchBet] RPC lag - tx not found, retrying in ${attempt + 1}s... (attempt ${attempt + 1}/${maxRetries})`);
      } catch (err) {
        console.log(`[commitMatchBet] Attempt ${attempt + 1} failed:`, err.message);
      }
      
      if (attempt < maxRetries - 1) {
        const delayMs = (attempt + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    if (!tx) {
      return Response.json({ 
        error: 'Transaction propagation timeout. The transaction may still succeed on-chain. Please refresh and check your bets.',
        signature 
      }, { status: 400 });
    }
    
    if (tx.meta?.err) {
      return Response.json({ error: 'Transaction failed on-chain', onChainError: tx.meta.err }, { status: 400 });
    }
    
    // Update BetOffer if exists (for matched bets) - handle both formats
    if (offer) {
      // Old format
      const existingOffer = await serviceRole.entities.BetOffer.get(offer.id);
      if (existingOffer) {
        await serviceRole.entities.BetOffer.update(offer.id, {
          amount_matched: (existingOffer.amount_matched || 0) + (offer.amount_matched || 0),
          amount_unmatched: Math.max(0, (existingOffer.amount_unmatched || 0) - (offer.amount_matched || 0)),
          status: (existingOffer.amount_unmatched || 0) - (offer.amount_matched || 0) <= 0.0001 ? 'fully_matched' : 'partially_matched',
        });
        console.log('[commitMatchBet] Updated BetOffer (old format):', offer.id);
      }
    } else if (offerUpdate && userBet?.offer_id) {
      // New format
      const existingOffer = await serviceRole.entities.BetOffer.get(userBet.offer_id);
      if (existingOffer) {
        await serviceRole.entities.BetOffer.update(userBet.offer_id, offerUpdate);
        console.log('[commitMatchBet] Updated BetOffer (new format):', userBet.offer_id);
      }
    }
    
    // Create UserBet record
    const createdBet = await serviceRole.entities.UserBet.create({
      ...userBet,
      _isParimutuel: userBet._isParimutuel || false,
    });
    console.log('[commitMatchBet] Created UserBet:', createdBet.id);
    
    // Update Bet pool totals and bettor count - handle both formats
    if (betUpdate) {
      // New format
      const bet = await serviceRole.entities.Bet.get(userBet.bet_id);
      if (bet) {
        await serviceRole.entities.Bet.update(userBet.bet_id, {
          [betUpdate.poolKey]: (bet[betUpdate.poolKey] || 0) + betUpdate.amount,
          total_pool: (bet.total_pool || 0) + betUpdate.amount,
          total_bettors: (bet.total_bettors || 0) + 1,
        });
        console.log('[commitMatchBet] Updated Bet pools (new format)');
      }
    } else if (lpField && amount) {
      // Old format
      const bet = await serviceRole.entities.Bet.get(userBet.bet_id);
      if (bet) {
        const poolKey = lpField || (userBet.outcome === 'a' ? 'lp_amount_a' : userBet.outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw');
        await serviceRole.entities.Bet.update(userBet.bet_id, {
          [poolKey]: (bet[poolKey] || 0) + amount,
          total_pool: (bet.total_pool || 0) + amount,
          total_bettors: (bet.total_bettors || 0) + 1,
        });
        console.log('[commitMatchBet] Updated Bet pools (old format)');
      }
    }
    
    return Response.json({
      success: true,
      userBetId: createdBet.id,
      message: `✓ ◎${amount || betUpdate?.amount || userBet.amount} bet committed successfully!`,
    });
    
  } catch (error) {
    console.error('[commitMatchBet] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});