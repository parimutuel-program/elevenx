import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Fetch REAL on-chain liquidity for futures market outcomes.
 * Reads lp_offer accounts directly from Solana and calculates available liquidity.
 * Returns max bettable amount based on liability constraints.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    const SOLANA_RPC_URL = Deno.env.get('SOLANA_RPC_URL') || 'https://api.devnet.solana.com';
    
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'SOLANA_PROGRAM_ID not configured' }, { status: 500 });
    }
    
    const payload = await req.json();
    const { market_id } = payload;
    
    if (!market_id) {
      return Response.json({ error: 'Missing market_id' }, { status: 400 });
    }
    
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    // Derive market PDA
    const marketIdBytes = Buffer.from(market_id.padEnd(32, '\0').slice(0, 32));
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketIdBytes],
      programId
    );
    
    console.log('[getFuturesLiquidity] Market PDA:', marketPda.toBase58());
    
    // Fetch all LP offers for this market from database (to get LP wallet addresses)
    const offers = await base44.entities.BetOffer.filter({
      bet_id: market_id,
      match_id: market_id,
    });
    
    console.log('[getFuturesLiquidity] Found', offers.length, 'LP offers in DB (all statuses)');
    console.log('[getFuturesLiquidity] Offers details:', offers.map(o => ({ id: o.id, outcome: o.outcome, outcome_label: o.outcome_label, status: o.status, unmatched: o.amount_unmatched, has_pda: !!o.solana_position_pda })));
    
    // Filter to active offers only
    const activeOffers = offers.filter(o => 
      (o.status === 'open' || o.status === 'partially_matched') &&
      (o.amount_unmatched || 0) > 0
    );
    console.log('[getFuturesLiquidity] Active offers after filter:', activeOffers.length);
    
    // For each outcome (0=1st, 1=2nd, 2=3rd), calculate real on-chain liquidity
    const outcomeLiquidity = {
      0: { totalAvailable: 0, offers: [], maxStake: 0, oddsBps: 0 },
      1: { totalAvailable: 0, offers: [], maxStake: 0, oddsBps: 0 },
      2: { totalAvailable: 0, offers: [], maxStake: 0, oddsBps: 0 },
    };
    
    // Fetch on-chain data for each LP offer
    for (const offer of activeOffers) {
      const outcomeIndex = offer.outcome === 'a' ? 0 : offer.outcome === 'b' ? 1 : 2;
      const lpPubkey = new PublicKey(offer.lp_wallet_address);
      
      // Derive lp_offer PDA
      const [lpOfferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
        programId
      );
      
      try {
        const accountInfo = await connection.getAccountInfo(lpOfferPda);
        
        if (!accountInfo) {
          console.log('[getFuturesLiquidity] lp_offer not found on-chain:', lpOfferPda.toBase58());
          continue;
        }
        
        // Parse lp_offer account data
        // Layout: discriminator (8) + amount_committed (u64 LE) + amount_matched (u64 LE) + ...
        const data = accountInfo.data;
        if (data.length < 24) {
          console.log('[getFuturesLiquidity] lp_offer data too small:', data.length);
          continue;
        }
        
        // Read u64 in little-endian format (Solana standard)
        const amountCommittedRaw = Number(data.readBigUInt64LE(8));
        const amountMatchedRaw = Number(data.readBigUInt64LE(16));
        
        // Validate: values should be reasonable (< 1 billion SOL = 1e18 lamports)
        if (amountCommittedRaw > 1e18 || amountMatchedRaw > 1e18) {
          console.log('[getFuturesLiquidity] Invalid on-chain data (values too large), using DB fallback');
          // Fall back to database values
          const dbAvailable = (offer.amount_unmatched || 0);
          const dbOddsBps = Math.round((offer.odds_at_creation || 2.0) * 100);
          let maxStakeDB = 0;
          if (dbOddsBps > 100) {
            maxStakeDB = (dbAvailable * 100) / (dbOddsBps - 100);
          } else {
            maxStakeDB = dbAvailable;
          }
          
          outcomeLiquidity[outcomeIndex].totalAvailable += dbAvailable;
          if (maxStakeDB > outcomeLiquidity[outcomeIndex].maxStake) {
            outcomeLiquidity[outcomeIndex].maxStake = maxStakeDB;
          }
          outcomeLiquidity[outcomeIndex].oddsBps = dbOddsBps;
          continue;
        }
        
        // Convert from lamports to SOL
        const amountCommitted = amountCommittedRaw / 1e9;
        const amountMatched = amountMatchedRaw / 1e9;
        const availableLiquidity = amountCommitted - amountMatched;
        
        // Skip offers with negative or zero available liquidity
        if (availableLiquidity <= 0) {
          console.log('[getFuturesLiquidity] Skipping offer with no available liquidity:', availableLiquidity);
          continue;
        }
        
        // Get odds_bps from the offer
        const oddsDecimal = offer.odds_at_creation || 2.0;
        const oddsBps = Math.round(oddsDecimal * 100);
        
        console.log('[getFuturesLiquidity] lp_offer parsed:', {
          outcome: outcomeIndex,
          amountCommitted,
          amountMatched,
          availableLiquidity,
          oddsBps,
        });
        
        // Calculate max stake based on liability
        let maxStakeForOffer = 0;
        if (oddsBps > 100) {
          maxStakeForOffer = (availableLiquidity * 100) / (oddsBps - 100);
        } else {
          maxStakeForOffer = availableLiquidity;
        }
        
        outcomeLiquidity[outcomeIndex].totalAvailable += availableLiquidity;
        outcomeLiquidity[outcomeIndex].offers.push({
          lp_wallet: offer.lp_wallet_address,
          amountCommitted,
          amountMatched,
          availableLiquidity,
          oddsBps,
          maxStake: maxStakeForOffer,
        });
        
        if (maxStakeForOffer > outcomeLiquidity[outcomeIndex].maxStake) {
          outcomeLiquidity[outcomeIndex].maxStake = maxStakeForOffer;
        }
        
        outcomeLiquidity[outcomeIndex].oddsBps = oddsBps;
        
      } catch (err) {
        console.error('[getFuturesLiquidity] Error fetching lp_offer:', lpOfferPda.toBase58(), err.message);
      }
    }
    
    // Convert to array format for UI
    const outcomes = [0, 1, 2].map(idx => ({
      outcomeIndex: idx,
      totalAvailable: outcomeLiquidity[idx].totalAvailable,
      maxStake: outcomeLiquidity[idx].maxStake,
      oddsBps: outcomeLiquidity[idx].oddsBps,
      offerCount: outcomeLiquidity[idx].offers.length,
      offers: outcomeLiquidity[idx].offers,
    }));
    
    console.log('[getFuturesLiquidity] Final liquidity:', outcomes);
    
    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      outcomes,
    });
    
  } catch (error) {
    console.error('[getFuturesLiquidity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});