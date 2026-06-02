import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * LP provides fixed-odds liquidity for a specific outcome.
 * Returns the Solana instruction for the frontend to sign.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Note: No auth check - wallet-only authentication
    // Check program ID is configured
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured. Please contact support.' }, { status: 500 });
    }
    
    // Validate program ID format
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(SOLANA_PROGRAM_ID)) {
      return Response.json({ error: 'Invalid Solana program ID configuration. Please contact support.' }, { status: 500 });
    }
    
    const payload = await req.json();
    const { walletAddress, bet_id, match_id, outcome, amount } = payload;

    console.log('=== provideLiquidity Request Payload ===', {
      walletAddress,
      bet_id,
      match_id,
      outcome,
      outcome_type: typeof outcome,
      amount,
      full_payload: payload,
    });

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!bet_id || !match_id || outcome === undefined || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount <= 0) return Response.json({ error: 'Amount must be positive' }, { status: 400 });

    // Validate wallet address is a valid Solana base58 address (32-44 chars, valid base58)
    if (!base58Regex.test(walletAddress)) {
      return Response.json({ 
        error: 'Invalid wallet address format. Please reconnect your wallet.', 
        hint: 'Address contains invalid characters or is corrupted'
      }, { status: 400 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') return Response.json({ error: 'Bet not open' }, { status: 400 });

    // Check if market is properly initialized on-chain
    const marketCheck = await base44.functions.invoke('checkMarketStatus', { match_id });
    if (marketCheck.data.status === 'not_created') {
      return Response.json({ 
        error: 'Market not created on-chain',
        hint: 'Please create the market on-chain first before providing liquidity',
        marketPda: marketCheck.data.marketPda,
      }, { status: 400 });
    }
    if (marketCheck.data.status === 'not_initialized') {
      return Response.json({ 
        error: 'Market account exists but is not properly initialized. The market creation may have failed.',
        hint: 'Please contact support. Market PDA: ' + marketCheck.data.marketPda,
        marketPda: marketCheck.data.marketPda,
        actualSize: marketCheck.data.actualSize,
      }, { status: 400 });
    }

    // Fetch match for display title
    const matches = await base44.entities.Match.filter({ id: match_id });
    const match = matches[0];

    // Derive outcome index (0=a, 1=b, 2=draw) - matches Solana program
    // Validate outcome value first
    if (outcome !== 'a' && outcome !== 'b' && outcome !== 'draw') {
      return Response.json({ 
        error: 'Invalid outcome value',
        hint: 'Outcome must be "a", "b", or "draw"',
        received: outcome,
      }, { status: 400 });
    }
    
    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';
    
    console.log('Outcome validation passed:', { outcome, outcomeIndex, outcomeLabel });

    // Derive PDAs
    const lpPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    // Check if market exists on-chain and is properly initialized
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      return Response.json({ 
        error: 'Market account does not exist on-chain. The market must be created before providing liquidity.',
        marketPda: marketPda.toBase58()
      }, { status: 400 });
    }
    
    // BetMarket struct should be ~215 bytes (8 discriminator + 207 data)
    const expectedMinSize = 200;
    if (marketInfo.data.length < expectedMinSize) {
      return Response.json({ 
        error: 'Market account exists but is not properly initialized. The market creation may have failed. Please contact support.',
        marketPda: marketPda.toBase58(),
        actualSize: marketInfo.data.length,
        expectedSize: expectedMinSize
      }, { status: 400 });
    }
    
    console.log('Market account properly initialized, size:', marketInfo.data.length);

    // Fetch market account data to check the stored bump
    const marketAccountInfo = await connection.getAccountInfo(marketPda);
    let storedBump = null;
    if (marketAccountInfo) {
      // Market account layout: discriminator (8) + match_id (32) + ... + bump (1 byte at end)
      const data = marketAccountInfo.data;
      storedBump = data[data.length - 1]; // Last byte is the bump
      console.log('Market account stored bump:', storedBump);
    }

    console.log('=== provideLiquidity PDA Debug ===', {
      outcome,
      outcomeIndex,
      walletAddress,
      match_id,
      match_id_bytes: matchIdBytes.toString('hex'),
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      derived_bump: PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId)[1],
      stored_bump: storedBump,
      bump_matches: storedBump === null || storedBump === PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId)[1],
      seeds_used: [
        'lp_offer',
        marketPda.toBase58(),
        lpPubkey.toBase58(),
        outcomeIndex,
      ],
    });

    // Get odds from bet entity (use odds_* fields, not oracle_odds_*)
    const oddsField = outcome === 'a' ? 'odds_a' : outcome === 'b' ? 'odds_b' : 'odds_draw';
    const oddsDecimal = bet[oddsField] || bet[`oracle_${oddsField}`] || 2.0; // fallback to 2.00x
    const oddsBps = Math.round(oddsDecimal * 100); // Convert to basis points
    
    console.log('Odds lookup:', { outcome, oddsField, oddsDecimal, oddsBps });

    // Record in BetOffer entity
    const existingOffers = await base44.entities.BetOffer.filter({ bet_id, lp_wallet_address: walletAddress, outcome });
    if (existingOffers.length > 0) {
      console.log('Existing BetOffer found with stored PDAs:', {
        stored_market_pda: existingOffers[0].solana_bet_pool_pda,
        stored_lp_pda: existingOffers[0].solana_position_pda,
        matches_current: existingOffers[0].solana_bet_pool_pda === marketPda.toBase58() && existingOffers[0].solana_position_pda === lpOfferPda.toBase58(),
      });
    }
    let offer;
    if (existingOffers.length > 0) {
      offer = await base44.entities.BetOffer.update(existingOffers[0].id, {
        amount_offered: (existingOffers[0].amount_offered || 0) + amount,
        amount_unmatched: (existingOffers[0].amount_unmatched || 0) + amount,
      });
      offer = { ...existingOffers[0], ...offer };
    } else {
      offer = await base44.entities.BetOffer.create({
        bet_id,
        match_id,
        outcome,
        outcome_label: outcomeLabel,
        amount_offered: amount,
        amount_matched: 0,
        amount_unmatched: amount,
        status: 'open',
        odds_at_creation: oddsBps / 100,
        lp_wallet_address: walletAddress,
        solana_bet_pool_pda: marketPda.toBase58(),
        solana_position_pda: lpOfferPda.toBase58(),
      });
    }

    // Update bet LP totals
    const lpField = outcome === 'a' ? 'lp_amount_a' : outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
    await base44.entities.Bet.update(bet_id, {
      [lpField]: (bet[lpField] || 0) + amount,
    });

    // Create UserBet record for LP position
    await base44.entities.UserBet.create({
      bet_id,
      match_id,
      offer_id: offer.id,
      outcome,
      amount,
      role: 'lp',
      status: 'pending',
      outcome_label: outcomeLabel,
      match_title: `${match?.team_a} vs ${match?.team_b}`,
      potential_payout: 0,
      wallet_address: walletAddress,
    });

    // Platform config PDA - use the same derivation as initPlatformConfig
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_config')],
      programId
    );

    console.log('Platform config PDA:', platformConfigPda.toBase58());

    return Response.json({
      success: true,
      offerId: offer.id,
      oddsBps,
      solana_instruction: {
        instruction_type: 'provide_liquidity',
        programId: SOLANA_PROGRAM_ID,
        accounts: {
          market: marketPda.toBase58(),
          lpOffer: lpOfferPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        },
        outcome: outcomeIndex,
        amountLamports: Math.round(amount * 1_000_000_000),
      },
      message: `Sign to commit ◎${amount} at ${oddsBps / 100}x for ${outcomeLabel}`,
    });

  } catch (error) {
    console.error('provideLiquidity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});