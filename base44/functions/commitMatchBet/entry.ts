import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection } from 'npm:@solana/web3.js@1.98.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { signature, betData } = await req.json();
    
    if (!signature) {
      return Response.json({ error: 'Missing signature' }, { status: 400 });
    }
    
    // Verify transaction exists on-chain with retry loop for Devnet RPC lag
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    let tx = null;
    
    // Retry up to 5 times with exponential backoff (1s, 2s, 3s, 4s, 5s = max 15s total)
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (tx) {
          console.log(`[commitMatchBet] Transaction found on attempt ${attempt + 1}:`, signature);
          break;
        }
        console.log(`[commitMatchBet] RPC lag - tx not found, retrying in ${attempt + 1}s... (attempt ${attempt + 1}/5)`);
      } catch (err) {
        console.log(`[commitMatchBet] RPC error on attempt ${attempt + 1}:`, err.message);
      }
      
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
    
    // Final validation after retries
    if (!tx) {
      return Response.json({ error: 'Transaction propagation timeout. Please refresh and check My Bets.' }, { status: 400 });
    }
    if (tx.meta?.err) {
      return Response.json({ error: 'Transaction failed on-chain', onChainError: tx.meta.err }, { status: 400 });
    }
    console.log('[commitMatchBet] Transaction verified on-chain:', signature);

    // Update BetOffer if exists
    if (betData.offerId) {
      const existingOffer = await base44.asServiceRole.entities.BetOffer.get(betData.offerId);
      if (existingOffer) {
        await base44.asServiceRole.entities.BetOffer.update(betData.offerId, {
          amount_matched: (existingOffer.amount_matched || 0) + betData.amount,
          amount_unmatched: Math.max(0, (existingOffer.amount_unmatched || 0) - betData.amount),
          status: (existingOffer.amount_unmatched || 0) - betData.amount <= 0.0001 ? 'fully_matched' : 'partially_matched',
        });
      }
    }

    // Create UserBet record
    await base44.asServiceRole.entities.UserBet.create({
      bet_id: betData.betId,
      match_id: betData.matchId,
      offer_id: betData.offerId || null,
      role: 'matcher',
      outcome: betData.outcome,
      amount: betData.amount,
      potential_payout: betData.potentialPayout,
      status: 'active',
      outcome_label: betData.outcomeLabel,
      match_title: betData.matchTitle,
      wallet_address: betData.walletAddress,
      _isParimutuel: betData.isParimutuel || false,
    });

    // Update Bet totals
    const bet = await base44.asServiceRole.entities.Bet.get(betData.betId);
    if (bet) {
      const poolField = betData.outcome === 'a' ? 'pool_a' : betData.outcome === 'b' ? 'pool_b' : 'pool_draw';
      await base44.asServiceRole.entities.Bet.update(betData.betId, {
        [poolField]: (bet[poolField] || 0) + betData.amount,
        total_pool: (bet.total_pool || 0) + betData.amount,
        total_bettors: (bet.total_bettors || 0) + 1,
      });
    }

    return Response.json({ success: true, message: 'Bet committed successfully' });

  } catch (error) {
    console.error('commitMatchBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});