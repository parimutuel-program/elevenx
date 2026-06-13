import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// REDEPLOYED: 2026-06-09 - Force refresh SOLANA_PROGRAM_ID secret
// Match against an existing offer — bettor takes the opposing side
// Bettor stakes at opposing odds: if LP offered Home @ 2.0, bettor bets Away
// LP's liability covers bettor's winnings

Deno.serve(async (req) => {
  try {
    // Use service role directly (no platform auth required - wallet-only auth)
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const body = await req.json();
    let { offer_id, amount, wallet_address, bet_id, match_id, outcome } = body;
    let trimmedWallet; // Will be set after normalization

    console.log('[matchBet] Request:', { offer_id, amount, wallet_address, bet_id, match_id, outcome });

    // Validate amount
    if (!amount || amount <= 0) {
      return Response.json({ error: 'Amount must be positive' }, { status: 400 });
    }

    if (!wallet_address) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // CRITICAL: Normalize wallet address - trim and validate format
    trimmedWallet = wallet_address.trim();
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedWallet)) {
      console.error('[matchBet] Invalid wallet address:', trimmedWallet);
      return Response.json({ 
        error: 'Invalid wallet address format',
        hint: 'Address must be 32-44 base58 characters (1-9A-HJ-NP-Za-km-z)'
      }, { status: 400 });
    }

    // CRITICAL: Must have EITHER offer_id (fixed-odds) OR bet_id+match_id+outcome (parimutuel)
    // Don't validate yet - check which mode we're in first
    const isParimutuelMode = !offer_id && bet_id && match_id && outcome;
    const isFixedOddsMode = offer_id;
    
    if (!isParimutuelMode && !isFixedOddsMode) {
      return Response.json({
        error: 'Missing bet parameters',
        hint: 'You must either provide an offer_id (fixed-odds) OR bet_id+match_id+outcome (parimutuel)',
        received: { offer_id, bet_id, match_id, outcome, amount }
      }, { status: 400 });
    }

    // PARIMUTUEL MODE: No offer_id required - bet goes to pending pool
    // Must have bet_id, match_id, and outcome instead
    if (!offer_id) {
      console.log('[matchBet] Parimutuel mode detected - checking required fields:', { bet_id, match_id, outcome, amount });
      
      if (!bet_id || !match_id || !outcome) {
        console.error('[matchBet] Missing required fields for parimutuel bet:', { bet_id, match_id, outcome });
        return Response.json({ 
          error: 'Missing bet_id, match_id, or outcome for parimutuel bet',
          hint: 'You must select an outcome (click on odds) before placing a bet',
          received: { bet_id, match_id, outcome, amount, offer_id }
        }, { status: 400 });
      }
      console.log('[matchBet] ✓ Parimutuel bet - no LP offer, bet will go to pending pool');
      // Continue with parimutuel logic below
    }

    // Verify wallet is authenticated (exists in WalletUser entity)
    console.log('[matchBet] Authenticating wallet:', trimmedWallet.slice(0, 8) + '...');
    
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const user = allWalletUsers.find(u => u.wallet_address === trimmedWallet);
    
    if (!user) {
      return Response.json({ 
        error: 'Wallet not authenticated. Please sign in with your wallet first.', 
        hint: 'Connect your wallet on the Profile page to authenticate'
      }, { status: 401 });
    }
    console.log('[matchBet] ✓ Authenticated user');

    // Try to create PublicKey to validate
    try {
      new PublicKey(trimmedWallet);
    } catch (e) {
      console.error('[matchBet] PublicKey validation failed:', e.message);
      return Response.json({ 
        error: 'Invalid Solana wallet address', 
        hint: e.message,
        debug: { address: trimmedWallet }
      }, { status: 400 });
    }

    // FIXED-ODDS MODE: Load LP offer and match against it
    const offers = await serviceRole.entities.BetOffer.filter({ id: offer_id });
    const offer = offers[0];
    if (!offer) {
      console.error('[matchBet] Offer not found:', { offer_id });
      return Response.json({ error: 'Offer not found', offer_id }, { status: 404 });
    }
    
    // Verify the bet record says market was deployed
    const betsCheck = await serviceRole.entities.Bet.filter({ id: offer.bet_id });
    const betCheck = betsCheck[0];
    if (betCheck && betCheck.solana_market_created === false) {
      return Response.json({
        error: 'Market not deployed on-chain yet',
        hint: 'Admin must deploy this market first',
      }, { status: 400 });
    }
    
    console.log('[matchBet] Loaded offer:', {
      id: offer.id,
      status: offer.status,
      outcome: offer.outcome,
      amount_unmatched: offer.amount_unmatched,
      lp_wallet_address: offer.lp_wallet_address?.slice(0, 8) + '...',
      solana_bet_pool_pda: offer.solana_bet_pool_pda,
      solana_position_pda: offer.solana_position_pda,
    });
    
    if (offer.status === 'cancelled' || offer.status === 'fully_matched') {
      return Response.json({ error: 'Offer is no longer available', status: offer.status }, { status: 400 });
    }
    
    // CRITICAL: Validate bettor stake doesn't exceed available LP liquidity
    const availableLiquidity = offer.amount_unmatched || 0;
    if (amount > availableLiquidity) {
      return Response.json({
        error: `Stake exceeds available liquidity (max: ◎${availableLiquidity.toFixed(4)} SOL)`,
        hint: 'Your stake cannot exceed the LP offer size',
        maxAllowed: availableLiquidity,
        requested: amount,
      }, { status: 400 });
    }
    
    // Check if offer has required LP wallet address
    if (!offer.lp_wallet_address) {
      console.error('[matchBet] Offer missing lp_wallet_address:', { offer_id: offer.id, offer });
      return Response.json({ 
        error: 'Invalid offer: LP wallet address missing',
        hint: 'This offer was created before wallet tracking. LP should delete and recreate it.',
        offer_id: offer.id,
      }, { status: 400 });
    }

    // Load bet/market
    const bets = await serviceRole.entities.Bet.filter({ id: offer.bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') return Response.json({ error: 'Market not open' }, { status: 400 });

    // Check if betting window has closed
    if (bet.open_until) {
      const now = new Date().getTime();
      const closeTime = new Date(bet.open_until).getTime();
      if (now >= closeTime) {
        return Response.json({ 
          error: 'Betting window has closed',
          hint: 'This market is no longer accepting bets',
          closed_at: bet.open_until,
        }, { status: 400 });
      }
    }

    // Calculate potential payout using LP odds
    const lp_odds = offer.odds_at_creation || 2.0;

    // Validate LP wallet address exists
    console.log('[matchBet] Offer data:', {
      offer_id: offer.id,
      lp_wallet_address: offer.lp_wallet_address,
      outcome: offer.outcome,
      amount_unmatched: offer.amount_unmatched,
      status: offer.status,
    });
    
    if (!offer.lp_wallet_address) {
      console.error('[matchBet] Offer missing lp_wallet_address:', {
        offer_id: offer_id,
        offer,
      });
      return Response.json({ 
        error: 'Invalid offer: LP wallet address missing',
        hint: 'This offer was created before wallet tracking was enabled. Please delete old offers and create new ones.',
        offer_id: offer_id,
        offer_outcome: offer.outcome,
        offer_status: offer.status,
      }, { status: 400 });
    }

    // Bettor bets on the SAME outcome as the LP offer
    // LP provides liquidity FOR that outcome - if it wins, LP pays bettor; if it loses, LP keeps bettor's stake
    const bettor_outcome = offer.outcome;
    const bettor_outcome_label = offer.outcome_label;
    const potential_payout = amount * lp_odds;

    // Get Solana program ID and derive PDAs — use ELEVENX_PROGRAM_ID (canonical deployed address)
    const SOLANA_PROGRAM_ID = Deno.env.get('ELEVENX_PROGRAM_ID') || Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(offer.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(offer.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const bettorPubkey = new PublicKey(trimmedWallet);
    const outcomeIndex = bettor_outcome === 'a' ? 0 : bettor_outcome === 'b' ? 1 : 2;

    // CRITICAL: Include outcome byte in position PDA seeds
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    const amountLamports = Math.round(amount * 1_000_000_000);

    // Use the stored LP offer PDA from the database (derived when LP was created)
    let lpOfferPda;
    try {
      if (!offer.solana_position_pda) {
        console.error('[matchBet] Offer missing solana_position_pda:', { offer_id: offer.id });
        return Response.json({ 
          error: 'Invalid offer: PDA missing',
          hint: 'This offer was not properly created on-chain',
        }, { status: 500 });
      }
      lpOfferPda = new PublicKey(offer.solana_position_pda);
      console.log('[matchBet] Using stored LP offer PDA:', lpOfferPda.toBase58());
    } catch (e) {
      console.error('[matchBet] Failed to use stored LP offer PDA:', {
        solana_position_pda: offer.solana_position_pda,
        error: e.message,
      });
      return Response.json({ 
        error: 'Failed to process offer - invalid PDA',
        hint: e.message,
      }, { status: 500 });
    }

    // PRE-FLIGHT: Verify on-chain LP offer still has real liquidity.
    // Prevents sending a tx that reverts with AnchorError 6017 (NoLiquidity).
    // LpOffer layout: discriminator(8) + market(32) + lp(32) + outcome(1) + odds_bps(8)
    //   + amount_committed(u64 LE @81) + amount_matched(u64 LE @89) + closed(bool @97)
    try {
      const { Connection } = await import('npm:@solana/web3.js@1.98.4');
      const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const accountInfo = await connection.getAccountInfo(lpOfferPda);
      if (!accountInfo || accountInfo.data.length < 98) {
        return Response.json({
          error: 'LP offer no longer available on-chain',
          hint: 'The liquidity for this offer has been withdrawn. Please refresh and select another offer.',
          offer_stale: true,
        }, { status: 400 });
      }
      const data = accountInfo.data;
      const closed = data[97] === 1;
      const committed = Number(data.readBigUInt64LE(81));
      const matched = Number(data.readBigUInt64LE(89));
      const onChainUnmatched = Math.max(0, committed - matched);
      console.log('[matchBet] On-chain LP offer state:', {
        closed,
        committed: committed / 1e9,
        matched: matched / 1e9,
        unmatched: onChainUnmatched / 1e9,
        requested: amountLamports,
      });
      if (closed || onChainUnmatched < amountLamports) {
        return Response.json({
          error: closed
            ? 'LP offer is closed on-chain. Please refresh and select another offer.'
            : `Insufficient on-chain liquidity (available: ◎${(onChainUnmatched / 1e9).toFixed(4)}, requested: ◎${(amountLamports / 1e9).toFixed(4)})`,
          offer_stale: true,
          available: onChainUnmatched / 1e9,
        }, { status: 400 });
      }
    } catch (preflightErr) {
      // Non-fatal: if RPC is down, proceed — the tx will revert on-chain if liquidity is missing
      console.warn('[matchBet] On-chain pre-flight check failed (non-fatal):', preflightErr.message);
    }

    // Prepare commit data (do NOT write to DB yet - will commit after transaction succeeds)
    const commit_data = {
      userBet: {
        bet_id: offer.bet_id,
        match_id: offer.match_id,
        offer_id: offer.id,
        role: 'matcher',
        outcome: bettor_outcome,
        outcome_label: bettor_outcome_label,
        amount,
        potential_payout,
        status: 'active',
        match_title: bet.title,
        wallet_address: trimmedWallet,
      },
      offerUpdate: {
        amount_matched: (offer.amount_matched || 0) + amount,
        amount_unmatched: availableLiquidity - amount,
        status: (availableLiquidity - amount) <= 0.0001 ? 'fully_matched' : 'partially_matched',
      },
      betUpdate: {
        poolKey: `pool_${offer.outcome}`,
        currentPool: bet[offer.outcome === 'a' ? 'pool_a' : offer.outcome === 'b' ? 'pool_b' : 'pool_draw'] || 0,
        amount,
      },
    };

    console.log('[matchBet] Preparing place_bet instruction:', {
      bettor_outcome,
      bettor_outcome_label,
      outcomeIndex,
      lpWallet: offer.lp_wallet_address,
      lpOfferPda: lpOfferPda.toBase58(),
      marketPda: marketPda.toBase58(),
      positionPda: positionPda.toBase58(),
    });

    // Serialize place_bet instruction data: discriminator(8) + outcome(u8) + amount(u64 LE)
    // Discriminator: SHA256("global:place_bet")[0..8] = [222, 62, 67, 220, 63, 166, 126, 33]
    const discriminator = Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]);
    const instructionData = Buffer.alloc(17);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);
    instructionData.writeBigUInt64LE(BigInt(amountLamports), 9);

    const keys = [
      { pubkey: marketPda.toBase58(),        isSigner: false, isWritable: true },
      { pubkey: lpOfferPda.toBase58(),        isSigner: false, isWritable: true },
      { pubkey: positionPda.toBase58(),       isSigner: false, isWritable: true },
      { pubkey: trimmedWallet,                isSigner: true,  isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    console.log('[matchBet] place_bet instruction_data (hex):', instructionData.toString('hex'));
    console.log('[matchBet] place_bet keys:', keys.map((k, i) => `[${i}] ${k.pubkey}`));

    return Response.json({
      success: true,
      potential_payout,
      matcher_outcome_label: bettor_outcome_label,
      solana_instruction: {
        instruction_type: 'place_bet',
        programId: SOLANA_PROGRAM_ID,
        keys,
        instruction_data: instructionData.toString('base64'),
        amountLamports,
      },
      // Data to commit after transaction succeeds (not written to DB yet)
      commit_data,
      message: `✓ Ready to bet ◎${amount.toFixed(4)} on ${bettor_outcome_label} — sign transaction to commit`,
    });
  } catch (error) {
    console.error('[matchBet] Unexpected error:', {
      message: error.message,
      stack: error.stack,
    });
    return Response.json({ 
      error: error.message || 'Failed to match bet',
      hint: 'Check console logs for details',
    }, { status: 500 });
  }
});