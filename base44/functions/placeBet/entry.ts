import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

/**
 * Fixed-odds betting — LP liquidity REQUIRED.
 * HYBRID MODEL: 
 *   1. LPs MUST seed liquidity FIRST (betting locked if pool = 0)
 *   2. Bettor stake CANNOT exceed LP pool size (guaranteed solvency)
 *   3. Bettor matches against existing LP offer at fixed odds
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured.' }, { status: 500 });
    }

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(SOLANA_PROGRAM_ID)) {
      return Response.json({ error: 'Invalid Solana program ID configuration.' }, { status: 500 });
    }

    const payload = await req.json();
    const { walletAddress, bet_id, match_id, outcome, amount } = payload;

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!bet_id || !match_id || outcome === undefined || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount <= 0) return Response.json({ error: 'Amount must be positive' }, { status: 400 });
    if (!base58Regex.test(walletAddress)) {
      return Response.json({ error: 'Invalid wallet address format. Please reconnect your wallet.' }, { status: 400 });
    }

    // Verify wallet is authenticated
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const user = allWalletUsers.find(u => u.wallet_address === walletAddress);
    if (!user) {
      return Response.json({
        error: 'Wallet not authenticated. Please sign in with your wallet first.',
        hint: 'Connect your wallet on the Profile page to authenticate',
      }, { status: 401 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') return Response.json({ error: 'Bet not open' }, { status: 400 });

    if (outcome !== 'a' && outcome !== 'b' && outcome !== 'draw') {
      return Response.json({ error: 'Invalid outcome. Must be "a", "b", or "draw"' }, { status: 400 });
    }

    // ── HYBRID MODEL: LP-FIRST ENFORCEMENT ─────────────────────────────────────
    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';
    const matches = await base44.entities.Match.filter({ id: match_id });
    const match = matches[0];

    // Check if LP offers already exist for this outcome
    const existingOffers = await base44.entities.BetOffer.filter({
      bet_id,
      match_id,
      outcome,
      status: { $in: ['open', 'partially_matched'] }
    });

    // CRITICAL FIX: Filter out offers with zero or negative unmatched amounts BEFORE calculating total
    const validOffers = existingOffers.filter(offer => (offer.amount_unmatched || 0) > 0);
    const totalLiquidity = validOffers.reduce((sum, offer) => sum + (offer.amount_unmatched || 0), 0);
    
    console.log('[placeBet] Liquidity check:', {
      totalOffers: existingOffers.length,
      validOffers: validOffers.length,
      totalLiquidity,
      amount,
    });

    console.log('[placeBet] Hybrid model check:', {
      outcome,
      existingOffersCount: existingOffers.length,
      totalLiquidity,
      amount,
    });

    // ENFORCE LP-FIRST RULE: Bettor cannot bet if no LP liquidity exists
    if (totalLiquidity <= 0) {
      return Response.json({
        error: 'No liquidity available for this outcome',
        hint: 'LPs must provide liquidity first before bets can be placed',
        requiresLiquidity: true,
        outcome: outcomeLabel,
      }, { status: 400 });
    }

    // ENFORCE STAKE LIMIT: Bettor stake cannot exceed available LP pool
    if (amount > totalLiquidity) {
      return Response.json({
        error: `Stake exceeds available liquidity (max: ◎${totalLiquidity.toFixed(4)} SOL)`,
        hint: 'Your stake cannot exceed the LP pool size',
        maxAllowed: totalLiquidity,
        requested: amount,
      }, { status: 400 });
    }

    const bettorPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    
    // Find the best matching LP offer (highest unmatched amount)
    // CRITICAL: Must use validOffers (filtered to only positive unmatched amounts)
    const bestOffer = validOffers.reduce((best, current) => 
      (current.amount_unmatched || 0) > (best.amount_unmatched || 0) ? current : best
    , validOffers[0]);
    
    if (!bestOffer) {
      return Response.json({
        error: 'No valid liquidity available (all offers fully matched)',
        hint: 'Please wait for LPs to add more liquidity',
      }, { status: 400 });
    }

    // CRITICAL: Derive LP offer PDA dynamically to avoid stale database values
    // The stored solana_position_pda might be from an older program ID or incorrect derivation
    const lpPubkey = new PublicKey(bestOffer.lp_wallet_address);
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );
    
    console.log('[placeBet] LP Offer PDA derivation:', {
      stored_pda: bestOffer.solana_position_pda,
      derived_pda: lpOfferPda.toBase58(),
      match: bestOffer.solana_position_pda === lpOfferPda.toBase58(),
    });
    
    // CRITICAL: Include outcome byte in PDA seeds to allow multiple independent bets per wallet
    const [bettorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    console.log('[placeBet] Fixed-odds bet (matching LP):', {
      bettor: walletAddress,
      outcome,
      outcomeIndex,
      amount,
      matchedAgainst: bestOffer.lp_wallet_address,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      bettorPositionPda: bettorPositionPda.toBase58(),
      storedLpOfferPda: bestOffer.solana_position_pda,
      pdas_match: lpOfferPda.toBase58() === bestOffer.solana_position_pda,
    });

    // Calculate potential payout using LP odds
    const oddsDecimal = bestOffer.odds_at_creation || 2.0;
    const potentialPayout = amount * oddsDecimal;

    // Prepare commit data — bettor matches against existing LP
    const commit_data = {
      userBet: {
        bet_id,
        match_id,
        offer_id: bestOffer.id, // CRITICAL: Reference the LP offer being matched
        outcome,
        amount,
        role: 'matcher', // CRITICAL: Bettor (not LP)
        status: 'active',
        outcome_label: outcomeLabel,
        match_title: match ? `${match.team_a} vs ${match.team_b}` : '',
        potential_payout: potentialPayout,
        wallet_address: walletAddress,
      },
      offerUpdate: {
        offer_id: bestOffer.id,
        amount_matched: (bestOffer.amount_matched || 0) + amount,
        amount_unmatched: (bestOffer.amount_unmatched || 0) - amount,
        status: ((bestOffer.amount_unmatched || 0) - amount) <= 0.0001 ? 'fully_matched' : 'partially_matched',
      },
      betUpdate: {
        bet_id,
        poolKey: outcome === 'a' ? 'pool_a' : outcome === 'b' ? 'pool_b' : 'pool_draw',
        currentPool: outcome === 'a' ? (bet.pool_a || 0) : outcome === 'b' ? (bet.pool_b || 0) : (bet.pool_draw || 0),
        total_pool: bet.total_pool || 0,
        total_bettors: bet.total_bettors || 0,
        amount,
      },
    };

    return Response.json({
      success: true,
      amount,
      odds: oddsDecimal,
      potentialPayout,
      lp_offer_id: bestOffer.id,
      commit_data,
      solana_instruction: {
        instruction_type: 'place_bet',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        bettorPositionPda: bettorPositionPda.toBase58(),
        outcome: outcomeIndex,
        amountLamports: Math.round(amount * 1_000_000_000),
      },
      message: `✓ Ready to bet ◎${amount} on ${outcomeLabel} @ ${oddsDecimal.toFixed(2)}x — sign to confirm`,
    });

  } catch (error) {
    console.error('placeBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});