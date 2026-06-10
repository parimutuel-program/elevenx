import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * refund_lp instruction builder (LP refund on voided market)
 * Discriminator: [183, 89, 142, 201, 73, 123, 200, 254] (SHA256("global:refund_lp").slice(0, 8))
 * Data: discriminator only (no args)
 * Accounts: market, lp_offer, lp_wallet (signer), system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const { programIdStr, programId, connection } = getSolanaConfig();

    const { userBetId, walletAddress } = await req.json();

    if (!walletAddress) {
      return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    }

    if (!userBetId) {
      return Response.json({ error: 'Missing userBetId' }, { status: 400 });
    }

    // Fetch UserBet
    const userBets = await serviceRole.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) {
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    if (userBet.role !== 'lp') {
      return Response.json({ error: 'Not an LP bet' }, { status: 400 });
    }

    // Fetch associated Bet or FuturesMarket
    let market, isFutures;
    if (userBet.futures_market_id) {
      const futuresMarkets = await serviceRole.entities.FuturesMarket.filter({ id: userBet.futures_market_id });
      market = futuresMarkets[0];
      isFutures = true;
      if (!market) {
        return Response.json({ error: 'Futures market not found' }, { status: 404 });
      }
    } else {
      const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
      market = bets[0];
      isFutures = false;
      if (!market) {
        return Response.json({ error: 'Bet entity not found' }, { status: 404 });
      }
    }

    // Check market is voided
    if (market.status !== 'void') {
      return Response.json({ error: 'Market not voided' }, { status: 400 });
    }

    const lpPubkey = new PublicKey(walletAddress);
    const marketId = isFutures ? userBet.futures_market_id : userBet.match_id;
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(marketId, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(marketId.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketIdBytes], programId);
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    // Verify market exists on-chain
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      return Response.json({ error: 'Market not found on-chain', marketPda: marketPda.toBase58() }, { status: 400 });
    }

    // Verify market is voided on-chain (byte 277)
    const isVoided = marketInfo.data.length > 277 && marketInfo.data[277] === 1;
    if (!isVoided) {
      return Response.json({ error: 'Market not voided on-chain' }, { status: 400 });
    }

    // Verify lp_offer exists on-chain
    const lpOfferInfo = await connection.getAccountInfo(lpOfferPda);
    if (!lpOfferInfo) {
      return Response.json({ error: 'LP offer not found on-chain', lpOfferPda: lpOfferPda.toBase58() }, { status: 400 });
    }

    // Build instruction data: discriminator only
    const discriminator = Buffer.from([173, 60, 2, 235, 56, 23, 75, 182]);

    console.log('[refundLp] programId:', programIdStr);
    console.log('[refundLp] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[refundLp] Accounts:', {
      market: marketPda.toBase58(),
      lpOffer: lpOfferPda.toBase58(),
      lpWallet: walletAddress,
    });

    // Accounts: market (writable), lp_offer (writable), lp_wallet (signer, writable), system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: lpOfferPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    // Calculate refund amount: matched liability + unmatched liquidity
    const matchedAmount = userBet.liquidity_matched || 0;
    const unmatchedAmount = userBet.liquidity_unmatched || userBet.amount || 0;
    const totalRefund = matchedAmount + unmatchedAmount;
    const refundLamports = Math.round(totalRefund * 1_000_000_000);

    return Response.json({
      success: true,
      message: `Ready to claim LP refund of ◎${totalRefund.toFixed(4)} SOL`,
      userBetId,
      refundAmount: totalRefund,
      breakdown: {
        matched: matchedAmount,
        unmatched: unmatchedAmount,
      },
      solana_instruction: {
        instruction_type: 'claim_refund',
        programId: programIdStr,
        keys,
        instruction_data: discriminator.toString('base64'),
        amountLamports: refundLamports,
      },
    });

  } catch (error) {
    console.error('[refundLp] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});