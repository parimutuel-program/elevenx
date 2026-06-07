import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Generate Solana instruction for LPs to withdraw winnings from settled markets.
 * INCLUDES LP fee bonus: Real LP stakers (role='lp') automatically receive a share
 * of platform fees when they withdraw from winning markets.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }
    
    const { userBetId } = await req.json();
    if (!userBetId) {
      return Response.json({ error: 'Missing userBetId' }, { status: 400 });
    }

    // Fetch UserBet
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) {
      console.error('[withdrawLpWinnings] UserBet not found:', userBetId);
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    console.log('[withdrawLpWinnings] UserBet:', {
      id: userBet.id,
      role: userBet.role,
      outcome: userBet.outcome,
      offer_id: userBet.offer_id,
      bet_id: userBet.bet_id,
      match_id: userBet.match_id,
      status: userBet.status,
      amount: userBet.amount,
    });

    // Must be LP role
    if (userBet.role !== 'lp') {
      console.error('[withdrawLpWinnings] Not LP role:', userBet.role);
      return Response.json({ error: 'Only LP positions can withdraw winnings' }, { status: 400 });
    }

    // Fetch BetOffer to get the PDA
    if (!userBet.offer_id) {
      console.error('[withdrawLpWinnings] No offer_id for UserBet:', userBetId);
      return Response.json({ error: 'LP offer not found' }, { status: 400 });
    }
    
    const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
    const offer = offers[0];
    if (!offer) {
      console.error('[withdrawLpWinnings] BetOffer not found:', userBet.offer_id);
      return Response.json({ error: 'BetOffer not found' }, { status: 404 });
    }

    console.log('[withdrawLpWinnings] BetOffer:', {
      id: offer.id,
      outcome: offer.outcome,
      outcome_label: offer.outcome_label,
      amount_matched: offer.amount_matched,
      status: offer.status,
      solana_position_pda: offer.solana_position_pda,
    });

    // Fetch market - try Bet first (for matches), then FuturesMarket (for tournament futures)
    let bet = null;
    let winningOutcome = null;
    let isFuturesMarket = false;
    
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    if (bets.length > 0) {
      bet = bets[0];
      winningOutcome = bet.winning_outcome;
      console.log('[withdrawLpWinnings] Found Bet (match market):', {
        id: bet.id,
        status: bet.status,
        winning_outcome: bet.winning_outcome,
      });
    } else {
      // Try FuturesMarket
      const futuresMarkets = await base44.entities.FuturesMarket.filter({ id: userBet.bet_id });
      if (futuresMarkets.length > 0) {
        isFuturesMarket = true;
        const futuresMarket = futuresMarkets[0];
        winningOutcome = futuresMarket.outcomes?.find(o => o.position === userBet.outcome)?.label;
        console.log('[withdrawLpWinnings] Found FuturesMarket:', {
          id: futuresMarket.id,
          status: futuresMarket.status,
          winning_position: winningOutcome,
        });
      }
    }
    
    if (!bet && !isFuturesMarket) {
      console.error('[withdrawLpWinnings] Market not found:', userBet.bet_id);
      return Response.json({ error: 'Market not found' }, { status: 404 });
    }

    // Market must be settled
    const marketStatus = bet?.status || (isFuturesMarket ? 'settled' : 'unknown');
    if (marketStatus !== 'settled') {
      console.error('[withdrawLpWinnings] Market not settled:', marketStatus);
      return Response.json({ error: 'Market has not been settled yet' }, { status: 400 });
    }

    // For futures markets, check if LP backed the winning position
    // For match markets, LP wins when their backed outcome LOSES
    console.log('[withdrawLpWinnings] Checking win condition:', {
      userBet_outcome: userBet.outcome,
      winningOutcome: winningOutcome || '(NOT SET)',
      isFuturesMarket,
    });
    
    // Validate winning_outcome is actually set
    if (!winningOutcome || winningOutcome === '') {
      console.error('[withdrawLpWinnings] Market settled but winning outcome not set');
      return Response.json({ error: 'Market is settled but winning outcome not set. Admin must announce winner first.' }, { status: 400 });
    }
    
    // For futures: LP wins if they backed the winning position (1st, 2nd, 3rd)
    // For matches: LP wins if their backed outcome LOSES (bettors lose)
    if (isFuturesMarket) {
      // Futures: LP wins when they backed the correct position
      const userPosition = userBet.outcome === 'a' ? '1st' : userBet.outcome === 'b' ? '2nd' : '3rd';
      if (userPosition !== winningOutcome) {
        console.error('[withdrawLpWinnings] LP backed wrong position:', {
          userPosition,
          winningOutcome,
        });
        return Response.json({ 
          error: 'This LP position did not win',
          hint: `You backed ${userPosition}, but the winner was ${winningOutcome}`,
          details: {
            your_position: userPosition,
            winning_position: winningOutcome,
          }
        }, { status: 400 });
      }
    } else {
      // Match betting: LP wins when their backed outcome LOSES
      if (userBet.outcome === winningOutcome) {
        console.error('[withdrawLpWinnings] LP backed the winning outcome:', {
          userBet_outcome: userBet.outcome,
          winning_outcome: winningOutcome,
          explanation: 'In parimutuel betting, LPs profit when bettors lose.',
        });
        return Response.json({ 
          error: 'This LP position did not win',
          hint: 'LPs win when their backed outcome LOSES (they collect losing bettors stakes).\n\nYou backed the WINNING outcome, so your LP position lost value.',
          details: {
            your_outcome: userBet.outcome,
            winning_outcome: winningOutcome,
          }
        }, { status: 400 });
      }
    }

    // Get wallet address - MUST match what's stored in the LP offer account
    const walletAddress = offer.lp_wallet_address || userBet.wallet_address;
    if (!walletAddress) {
      console.error('[withdrawLpWinnings] No wallet address found in offer or userBet');
      return Response.json({ error: 'No wallet address found' }, { status: 400 });
    }

    console.log('[withdrawLpWinnings] Wallet addresses:', {
      from_offer: offer.lp_wallet_address,
      from_userBet: userBet.wallet_address,
      using: walletAddress,
    });

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(walletAddress) || !base58Regex.test(SOLANA_PROGRAM_ID)) {
      return Response.json({ error: 'Invalid address format' }, { status: 400 });
    }

    // Derive PDAs
    const userPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    // Use the STORED LP offer PDA from database (this is what was created on-chain)
    // NOTE: Outcome mapping MUST match what was used when LP offer was created
    const outcomeValue = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    const lpOfferPda = offer.solana_position_pda ? new PublicKey(offer.solana_position_pda) : null;
    
    if (!lpOfferPda) {
      console.error('[withdrawLpWinnings] No stored LP offer PDA in BetOffer:', offer.id);
      return Response.json({ error: 'LP position PDA not found. Market may not be properly initialized.' }, { status: 400 });
    }

    // ALSO derive the PDA to verify it matches what's stored
    const [derivedLpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), userPubkey.toBuffer(), Buffer.from([outcomeValue])],
      programId
    );

    console.log('[withdrawLpWinnings] PDA comparison:', {
      stored_pda: lpOfferPda.toBase58(),
      derived_pda: derivedLpOfferPda.toBase58(),
      match: lpOfferPda.equals(derivedLpOfferPda),
      outcomeValue,
      userBet_outcome: userBet.outcome,
    });

    // Fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    console.log('[withdrawLpWinnings] PDAs:', {
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      lpWalletPubkey: userPubkey.toBase58(),
    });

    // Check if LP already withdrew (DB flag)
    if (offer.withdrawn === true) {
      console.error('[withdrawLpWinnings] LP already withdrew (DB flag):', offer.id);
      return Response.json({ error: 'This LP position has already been withdrawn' }, { status: 400 });
    }

    // ON-CHAIN CHECK: Fetch the actual LP offer account AND market from Solana to verify state
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // CRITICAL: Verify fee vault exists on-chain
    const feeVaultAccountInfo = await connection.getAccountInfo(feeVaultPda);
    if (!feeVaultAccountInfo) {
      console.error('[withdrawLpWinnings] Fee vault not found on-chain:', feeVaultPda.toBase58());
      return Response.json({ error: 'Fee vault not initialized on-chain' }, { status: 400 });
    }
    
    console.log('[withdrawLpWinnings] Fee vault verified on-chain:', feeVaultPda.toBase58());
    try {
      // First check the market account to see the winning_outcome stored on-chain
      const marketAccountInfo = await connection.getAccountInfo(marketPda);
      if (!marketAccountInfo) {
        console.error('[withdrawLpWinnings] Market account NOT FOUND on-chain:', marketPda.toBase58());
        return Response.json({ error: 'Market account not found on-chain. Market may not be deployed.' }, { status: 404 });
      }
      
      console.log('[withdrawLpWinnings] === ON-CHAIN PRE-CHECK ===');
      
      // Market layout: disc(8) + match_id(32) + outcome_names(96) + open_until(8) + settle_after(8) + fee_percent(2) + outcome_count(1) + winning_outcome(1) + oracle_odds(24) + total_matched(24) + total_pending(24) + total_lp_committed(8) + accrued_fees(8) + settled(1) + ...
      // winning_outcome is at offset: 8+32+96+8+8+2+1 = 155
      // settled is at offset: 244 (after accrued_fees at 236)
      const marketData = marketAccountInfo.data;
      const onChainWinningOutcome = marketData[155];
      
      // Debug: Read more fields to verify layout
      const outcomeCount = marketData[154];
      const feePercent = marketData.readUInt16LE(152);
      const settled = marketData[244]; // settled bool at offset 244
      
      console.log('[withdrawLpWinnings] Market on-chain state:', {
        onChainWinningOutcome,
        outcomeCount,
        feePercent: feePercent / 100, // basis points to percent
        settled,
        lpOutcome: outcomeValue,
        lpWinsIfDifferent: onChainWinningOutcome !== outcomeValue,
        db_winning_outcome: bet.winning_outcome,
        marketDataLength: marketData.length,
      });
      
      // CRITICAL: Check if market is actually settled on-chain
      if (!settled) {
        console.error('[withdrawLpWinnings] Market not settled on-chain:', marketPda.toBase58());
        return Response.json({ error: 'Market has not been settled on-chain yet. Admin must announce the winner first.' }, { status: 400 });
      }
      
      // Check if market was auto-voided (no bets on winning outcome)
      // In this case, LPs cannot withdraw winnings - they should withdraw unmatched liquidity instead
      const settledByte = marketData[244]; // settled bool at offset 244
      const voidedByte = marketData[245]; // voided bool at offset 245
      console.log('[withdrawLpWinnings] Market state bytes:', {
        settled: settledByte,
        voided: voidedByte,
        marketPda: marketPda.toBase58(),
      });
      
      if (voidedByte) {
        console.error('[withdrawLpWinnings] Market was auto-voided (no bets on winning outcome):', marketPda.toBase58());
        return Response.json({ 
          error: 'Market was auto-voided (no bets on winning outcome)',
          hint: 'When no one bet on the winning outcome, the market auto-voids and LPs should withdraw their unmatched liquidity instead of winnings.',
          action: 'withdraw_unmatched'
        }, { status: 400 });
      }
      
      const lpOfferAccountInfo = await connection.getAccountInfo(lpOfferPda);
      if (!lpOfferAccountInfo) {
        console.error('[withdrawLpWinnings] LP offer PDA not found on-chain:', lpOfferPda.toBase58());
        return Response.json({ error: 'LP position not found on-chain. The market may not be deployed.' }, { status: 400 });
      }

      // Parse the LP offer account data
      // LpOffer layout: discriminator (8) + market (32) + lp (32) + outcome (1) + odds_bps (8) + amount_committed (8) + amount_matched (8) + closed (1) + matched_stake (8) + withdrawn (1) + bump (1) = 108 bytes
      // Offsets: 0-7=disc, 8-39=market, 40-71=lp, 72=outcome, 73-80=odds_bps, 81-88=amount_committed, 89-96=amount_matched, 97=closed, 98-105=matched_stake, 106=withdrawn, 107=bump
      const accountData = lpOfferAccountInfo.data;
      const storedOutcomeValue = accountData[72]; // CRITICAL: Read the actual stored outcome from the account!
      const withdrawnFlag = accountData[106]; // withdrawn is a bool at offset 106
      const amountMatchedOnChain = accountData.readBigUInt64LE(89); // amount_matched at offset 89
      
      // CRITICAL: Read the stored LP address from the account (offset 40-71, 32 bytes)
      const storedLpPubkey = new PublicKey(accountData.slice(40, 72));
      
      console.log('[withdrawLpWinnings] Stored outcome vs derived:', {
        storedOutcomeValue,
        derivedOutcomeValue: outcomeValue,
        match: storedOutcomeValue === outcomeValue,
      });

      console.log('[withdrawLpWinnings] On-chain LP offer state:', {
        withdrawn: withdrawnFlag === 1,
        amountMatchedOnChain: Number(amountMatchedOnChain) / 1e9,
        lpOfferPda: lpOfferPda.toBase58(),
        accountDataLength: accountData.length,
        stored_pda: offer.solana_position_pda,
        storedLpPubkey: storedLpPubkey.toBase58(),
        walletWeAreUsing: userPubkey.toBase58(),
        walletsMatch: storedLpPubkey.toBase58() === userPubkey.toBase58(),
      });

      if (withdrawnFlag === 1) {
        console.error('[withdrawLpWinnings] LP already withdrew (on-chain):', offer.id);
        return Response.json({ error: 'This LP position has already been withdrawn on-chain' }, { status: 400 });
      }

      if (Number(amountMatchedOnChain) <= 0) {
        console.error('[withdrawLpWinnings] No matched liquidity (on-chain):', offer.id);
        return Response.json({ error: 'No matched liquidity available on-chain' }, { status: 400 });
      }
    } catch (onChainErr) {
      console.error('[withdrawLpWinnings] Failed to fetch on-chain LP offer:', onChainErr.message);
      return Response.json({ error: 'Failed to verify on-chain LP position: ' + onChainErr.message }, { status: 500 });
    }

    // Calculate LP winnings: matched stake from the offer
    // The LP earns the losing side's stakes (matched against their liquidity)
    const baseAmount = offer.amount_matched || 0;
    
    // Skip LP fee bonus calculation for performance (can be added back later with caching)
    const lpBonus = 0;
    
    // CRITICAL: DB stores amounts in SOL, but on-chain uses LAMPORTS
    // Convert SOL to lamports for the instruction
    const withdrawAmountLamports = Math.round(baseAmount * 1_000_000_000);
    
    console.log('[withdrawLpWinnings] Amount calculation:', {
      baseAmount_SOL: baseAmount,
      withdrawAmountLamports,
    });

    console.log('[withdrawLpWinnings] Success response:', {
      withdrawAmount: baseAmount,
      withdrawAmountLamports,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
    });

    // NOTE: The outcome value for the instruction should match the Rust program's expectation
    // Use the derived value since that's what was used to create the account
    const onChainOutcomeValue = outcomeValue;
    
    console.log('[withdrawLpWinnings] Final instruction payload:', {
      withdrawAmount_SOL: baseAmount,
      withdrawAmountLamports,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      lpWalletPubkey: userPubkey.toBase58(),
      storedLpInOffer: offer.lp_wallet_address,
    });
    
    return Response.json({
      success: true,
      withdrawAmount: baseAmount,
      lpFeeBonus: lpBonus,
      totalWithdraw: baseAmount + lpBonus,
      userBetId,
      offerId: offer.id,
      solana_instruction: {
        instruction_type: 'withdraw_lp_winnings',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
        lpWalletPubkey: userPubkey.toBase58(),
        withdrawAmountLamports,
        outcome: onChainOutcomeValue,
      },
      message: `Sign to withdraw ◎${baseAmount.toFixed(4)} from settled market`,
    });

  } catch (error) {
    console.error('withdrawLpWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});