import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection } from 'npm:@solana/web3.js@1.98.4';

/**
 * Commit matched bet to database AFTER transaction succeeds on-chain.
 * Called by frontend with transaction signature to verify and commit.
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
    
    const { userBet, offerUpdate, betUpdate } = commit_data;
    
    // Verify transaction exists on-chain
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    try {
      const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
      if (!tx) {
        return Response.json({ error: 'Transaction not found on-chain' }, { status: 400 });
      }
      if (tx.meta?.err) {
        return Response.json({ error: 'Transaction failed on-chain', onChainError: tx.meta.err }, { status: 400 });
      }
      console.log('[commitMatchBet] Transaction verified on-chain:', signature);
    } catch (err) {
      return Response.json({ error: 'Failed to verify transaction: ' + err.message }, { status: 400 });
    }
    
    // Update BetOffer
    await serviceRole.entities.BetOffer.update(userBet.offer_id, offerUpdate);
    console.log('[commitMatchBet] Updated BetOffer:', userBet.offer_id);
    
    // Create UserBet record
    const createdBet = await serviceRole.entities.UserBet.create(userBet);
    console.log('[commitMatchBet] Created UserBet:', createdBet.id);
    
    // Update Bet pool totals and bettor count
    const bet = await serviceRole.entities.Bet.get(userBet.bet_id);
    await serviceRole.entities.Bet.update(userBet.bet_id, {
      [betUpdate.poolKey]: (bet[betUpdate.poolKey] || 0) + betUpdate.amount,
      total_pool: (bet.total_pool || 0) + betUpdate.amount,
      total_bettors: (bet.total_bettors || 0) + 1,
    });
    console.log('[commitMatchBet] Updated Bet pools');
    
    return Response.json({
      success: true,
      userBetId: createdBet.id,
      message: `✓ ◎${betUpdate.amount} bet committed successfully!`,
    });
    
  } catch (error) {
    console.error('[commitMatchBet] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});