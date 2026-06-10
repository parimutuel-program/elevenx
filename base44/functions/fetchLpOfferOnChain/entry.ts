import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';

/**
 * Fetch and decode an lp_offer account from Solana.
 * Returns amount_committed, amount_matched, available, and closed flag.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pda } = await req.json();

    if (!pda) {
      return Response.json({ error: 'Missing pda' }, { status: 400 });
    }

    const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const pubkey = new PublicKey(pda);

    console.log('[fetchLpOfferOnChain] Fetching account:', pda);

    const accountInfo = await connection.getAccountInfo(pubkey);
    
    if (!accountInfo) {
      console.log('[fetchLpOfferOnChain] Account not found:', pda);
      return Response.json({ exists: false });
    }

    const data = accountInfo.data;
    console.log('[fetchLpOfferOnChain] Account data length:', data.length);

    if (data.length < 98) {
      console.error('[fetchLpOfferOnChain] Data too short:', data.length);
      return Response.json({ error: 'Data too short', length: data.length });
    }

    // LpOffer layout:
    // discriminator: 8 bytes (0-7)
    // market: Pubkey (32) → 8-39
    // lp: Pubkey (32) → 40-71
    // outcome: u8 (1) → 72
    // odds_bps: u64 (8) → 73-80
    // amount_committed: u64 (8) → 81-88
    // amount_matched: u64 (8) → 89-96
    // closed: bool (1) → 97
    
    const amountCommitted = Number(data.readBigUInt64LE(81)) / 1e9;
    const amountMatched = Number(data.readBigUInt64LE(89)) / 1e9;
    const closed = data[97] === 1;

    console.log('[fetchLpOfferOnChain] Decoded:', {
      amountCommitted,
      amountMatched,
      available: Math.max(0, amountCommitted - amountMatched),
      closed,
    });

    return Response.json({
      exists: true,
      amountCommitted,
      amountMatched,
      available: Math.max(0, amountCommitted - amountMatched),
      closed,
    });
  } catch (error) {
    console.error('[fetchLpOfferOnChain] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});