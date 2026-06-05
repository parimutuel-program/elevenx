import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

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

    // STRICT P2P MODE: Must have offer_id - no parimutuel fallback
    if (!offer_id) {
      return Response.json({
        error: 'No liquidity available for this outcome',
        hint: 'LP must seed this outcome first. Go to LP Dashboard to provide liquidity.',
        received: { bet_id, match_id, outcome, amount }
      }, { status: 400 });
    }

    // FIXED-ODDS MODE: Load LP offer and match against it
    const offers = await base44.entities.BetOffer.filter({ id: offer_id });
    const offer = offers[0];
    if (!offer) {
      console.error('[matchBet] Offer not found:', { offer_id });
      return Response.json({ error: 'Offer not found', offer_id }, { status: 404 });
    }
    
    // CRITICAL: Check if market exists on-chain BEFORE preparing bet
    try {
      const marketStatus = await base44.functions.invoke('checkMarketStatus', { match_id: offer.match_id, bet_id: offer.bet_id });
      console.log('[matchBet] Market status check (fixed-odds):', marketStatus.data);
      
      if (marketStatus.data.status === 'not_created' || marketStatus.data.status === 'not_initialized') {
        return Response.json({
          error: 'Market not deployed on-chain yet',
          hint: 'Admin must create the market on Solana first via Admin panel → Create Market On-Chain',
          status: marketStatus.data.status,
          marketPda: marketStatus.data.marketPda,
        }, { status: 400 });
      }
      
      if (marketStatus.data.settled) {
        return Response.json({ error: 'Market already settled' }, { status: 400 });
      }
      
      if (marketStatus.data.voided) {
        return Response.json({ error: 'Market has been voided' }, { status: 400 });
      }
      
      if (marketStatus.data.paused) {
        return Response.json({ error: 'Market is paused' }, { status: 400 });
      }
      
      console.log('[matchBet] ✓ Market verified on-chain (fixed-odds):', marketStatus.data.status);
    } catch (checkErr) {
      console.error('[matchBet] Failed to check market status (fixed-odds):', checkErr.message);
      // Don't block betting if check fails - allow with warning
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
    const bets = await base44.entities.Bet.filter({ id: offer.bet_id });
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

    // Removed max stake validation - bets can exceed LP liquidity and go pending
    // Calculate potential payout using LP odds (matched portion will be paid at these odds)
    const lp_odds = offer.odds_at_creation || (bettor_outcome === 'a' ? bet.odds_a : bettor_outcome === 'b' ? bet.odds_b : bet.odds_draw) || 2.0;

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

    // Get Solana program ID and derive PDAs
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
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

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );

    const amountLamports = Math.round(amount * 1_000_000_000);

    // Derive the actual LP offer PDA using the LP's wallet from the offer
    let lpPubkey, lpOfferPda;
    try {
      lpPubkey = new PublicKey(offer.lp_wallet_address);
      console.log('[matchBet] LP pubkey created:', lpPubkey.toBase58());
      
      [lpOfferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
        programId
      );
      console.log('[matchBet] LP offer PDA derived:', lpOfferPda.toBase58());
    } catch (e) {
      console.error('[matchBet] Failed to derive LP offer PDA:', {
        marketPda: marketPda?.toBase58(),
        lp_wallet_address: offer.lp_wallet_address,
        outcomeIndex,
        error: e.message,
      });
      return Response.json({ 
        error: 'Failed to process offer - invalid LP data',
        hint: e.message,
      }, { status: 500 });
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
        amount_unmatched: (offer.amount_unmatched || 0) - amount,
        status: (offer.amount_unmatched - amount) <= 0.0001 ? 'fully_matched' : 'partially_matched',
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

    return Response.json({
      success: true,
      potential_payout,
      matcher_outcome_label: bettor_outcome_label,
      solana_instruction: {
        instruction_type: 'place_bet',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        bettorPositionPda: positionPda.toBase58(),
        outcome: outcomeIndex,
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
      offer_id,
      amount,
      wallet_address: wallet_address?.slice(0, 8) + '...',
    });
    return Response.json({ 
      error: error.message || 'Failed to match bet',
      hint: 'Check console logs for details',
    }, { status: 500 });
  }
});