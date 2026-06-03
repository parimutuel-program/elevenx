import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Place a bet on a futures market outcome - ON-CHAIN REQUIRED.
 * Validates market exists on Solana, derives real PDAs, returns Solana instruction.
 * DB writes happen AFTER transaction succeeds via commitFuturesBet.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { walletAddress, marketId, outcome, amount } = payload;
    
    console.log('[placeFuturesBet] Payload received:', {
      walletAddress,
      marketId,
      outcome,
      amount,
    });
    
    if (!walletAddress) {
      console.error('[placeFuturesBet] Wallet not connected');
      return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    }
    if (!marketId || !outcome || !amount || amount <= 0) {
      console.error('[placeFuturesBet] Invalid input:', { marketId, outcome, amount });
      return Response.json({ 
        error: 'Invalid input',
        details: { marketId: !!marketId, outcome: !!outcome, amount: amount },
      }, { status: 400 });
    }

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(walletAddress)) {
      return Response.json({ error: 'Invalid wallet address format. Please reconnect your wallet.' }, { status: 400 });
    }

    // Get futures market
    const market = await base44.entities.FuturesMarket.get(marketId);
    if (!market) {
      return Response.json({ error: 'Market not found' }, { status: 404 });
    }

    if (market.status !== 'open') {
      return Response.json({ error: 'Market is not open for betting' }, { status: 400 });
    }

    // CRITICAL: Market MUST be deployed on-chain first
    if (!market.solana_market_created || !market.solana_market_pda) {
      console.error('[placeFuturesBet] Market not deployed:', {
        marketId: market.id,
        country: market.country,
        solana_market_created: market.solana_market_created,
        solana_market_pda: market.solana_market_pda,
      });
      return Response.json({
        error: `Market for ${market.country} is not deployed on-chain yet.`,
        hint: 'Admin must deploy this market first. Go to Admin panel → Futures tab → Click "Deploy" on this country.',
        marketId: market.id,
        country: market.country,
      }, { status: 400 });
    }

    // Find the specific outcome
    const selectedOutcome = market.outcomes.find(o => o.position === outcome.position);
    if (!selectedOutcome) {
      return Response.json({ error: 'Outcome not found' }, { status: 404 });
    }

    const potentialPayout = amount * selectedOutcome.odds;
    const outcomeIndex = outcome.position === '1st' ? 0 : outcome.position === '2nd' ? 1 : 2;
    const outcomeLabel = `${market.country} - ${outcome.position} Place`;

    // Get program ID and derive REAL PDAs
    const PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!PROGRAM_ID) {
      return Response.json({ error: 'SOLANA__PROGRAM_ID not configured' }, { status: 500 });
    }

    const programId = new PublicKey(PROGRAM_ID);
    const bettorPubkey = new PublicKey(walletAddress);
    
    // Derive market PDA (uses futures market ID as seed)
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(marketId, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(marketId.length, 32));
    
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketIdBytes],
      programId
    );

    // Derive LP offer PDA - for futures, we use a generic house LP
    // In production, each outcome would have its own LP offer
    const houseLpPubkey = programId; // Using program ID as house LP
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), houseLpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    // Derive bettor position PDA
    const [bettorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );

    console.log('[placeFuturesBet] Real PDAs:', {
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      bettorPositionPda: bettorPositionPda.toBase58(),
      bettor: walletAddress,
      outcome: outcomeIndex,
      amount,
    });

    // Calculate lamports (1 SOL = 1,000,000,000 lamports)
    const amountLamports = Math.floor(amount * 1e9);

    // Prepare commit data - DB writes happen AFTER transaction succeeds
    const commit_data = {
      userBet: {
        bet_id: marketId,
        match_id: marketId, // Using market ID for futures
        offer_id: 'futures_house_lp', // House LP for futures
        outcome: outcome.position === '1st' ? 'a' : outcome.position === '2nd' ? 'b' : 'draw',
        amount,
        role: 'matcher',
        status: 'active',
        outcome_label: outcomeLabel,
        match_title: outcomeLabel,
        potential_payout: potentialPayout,
        wallet_address: walletAddress,
      },
      marketUpdate: {
        market_id: marketId,
        outcomeIdx: outcomeIndex,
        outcome_label: outcomeLabel,
        amount,
      },
    };

    return Response.json({
      success: true,
      userBetId: null, // Will be created after commit
      commit_data,
      solana_instruction: {
        instruction_type: 'place_bet',
        programId: PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        bettorPositionPda: bettorPositionPda.toBase58(),
        amountLamports,
        outcome: outcomeIndex,
      },
      market,
      outcome: selectedOutcome,
      potentialPayout,
      message: `✓ Ready to bet ◎${amount} on ${outcomeLabel} at ${selectedOutcome.odds.toFixed(2)}x (potential ◎${potentialPayout.toFixed(2)})`,
    });

  } catch (error) {
    console.error('placeFuturesBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Compute Anchor 8-byte discriminator: SHA256("global:<name>").slice(0, 8)
async function anchorDiscriminator(name) {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  const buffer = new Uint8Array(hash).slice(0, 8);
  return Buffer.from(buffer);
}