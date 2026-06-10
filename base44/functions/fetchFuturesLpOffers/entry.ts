import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Fetch all lp_offer accounts for a given market and wallet.
 * Returns on-chain data for each outcome (committed, matched, available, closed).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { market_id, wallet_address } = await req.json();

    if (!market_id || !wallet_address) {
      return Response.json({ error: 'Missing market_id or wallet_address' }, { status: 400 });
    }

    // Get Solana config from secrets
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.devnet.solana.com';
    const programId = Deno.env.get('ELEVENX_PROGRAM_ID');
    
    if (!programId) {
      return Response.json({ error: 'ELEVENX_PROGRAM_ID not configured' }, { status: 500 });
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const programPubkey = new PublicKey(programId);
    const marketPubkey = new PublicKey(market_id);
    const walletPubkey = new PublicKey(wallet_address);

    console.log('[fetchFuturesLpOffers] Fetching lp_offers for:', {
      market_id,
      wallet_address,
      program_id: programId,
    });

    // Fetch all lp_offer PDAs for this market+wallet combination
    // Seeds: ["lp_offer", market, lp, outcome]
    const outcomes = [0, 1, 2]; // Futures have 3 outcomes
    const lpOffers = [];

    for (const outcome of outcomes) {
      // Derive PDA: seeds ["lp_offer", marketPda, lpWallet, [outcome]]
      const [pda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('lp_offer'),
          marketPubkey.toBuffer(),
          walletPubkey.toBuffer(),
          Buffer.from([outcome]),
        ],
        programPubkey
      );

      console.log('[fetchFuturesLpOffers] Checking outcome', outcome, 'PDA:', pda.toBase58());

      try {
        const accountInfo = await connection.getAccountInfo(pda);
        
        if (accountInfo) {
          const data = accountInfo.data;
          console.log('[fetchFuturesLpOffers] Account found for outcome', outcome, 'data length:', data.length);
          
          if (data.length >= 98) {
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
            
            lpOffers.push({
              outcome,
              pda: pda.toBase58(),
              amountCommitted,
              amountMatched,
              available: Math.max(0, amountCommitted - amountMatched),
              closed,
              exists: true,
            });
            
            console.log('[fetchFuturesLpOffers] Outcome', outcome, ':', {
              committed: amountCommitted,
              matched: amountMatched,
              available: amountCommitted - amountMatched,
              closed,
            });
          } else {
            console.warn('[fetchFuturesLpOffers] Data too short for outcome', outcome, ':', data.length);
            lpOffers.push({ outcome, pda: pda.toBase58(), exists: false, error: 'Data too short' });
          }
        } else {
          console.log('[fetchFuturesLpOffers] No account found for outcome', outcome);
          lpOffers.push({ outcome, pda: pda.toBase58(), exists: false });
        }
      } catch (err) {
        console.error('[fetchFuturesLpOffers] Error fetching outcome', outcome, ':', err.message);
        lpOffers.push({ outcome, pda: pda.toBase58(), exists: false, error: err.message });
      }
    }

    return Response.json({ lpOffers });
  } catch (error) {
    console.error('[fetchFuturesLpOffers] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});