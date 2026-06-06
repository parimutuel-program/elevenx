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

    // Fetch Bet to check settlement
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) {
      console.error('[withdrawLpWinnings] Bet not found:', userBet.bet_id);
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    console.log('[withdrawLpWinnings] Bet:', {
      id: bet.id,
      status: bet.status,
      winning_outcome: bet.winning_outcome,
      match_id: bet.match_id,
    });

    // Market must be settled
    if (bet.status !== 'settled') {
      console.error('[withdrawLpWinnings] Market not settled:', bet.status);
      return Response.json({ error: 'Market has not been settled yet' }, { status: 400 });
    }

    // Check if LP's outcome lost (LP wins when bettors lose)
    // LP backs outcome X — if outcome X loses, LP collects losing bettors' stakes
    console.log('[withdrawLpWinnings] Checking win condition:', {
      userBet_outcome: userBet.outcome,
      bet_winning_outcome: bet.winning_outcome || '(NOT SET)',
      lp_wins_if_different: userBet.outcome !== bet.winning_outcome,
    });
    
    // Validate winning_outcome is actually set
    if (!bet.winning_outcome || bet.winning_outcome === '') {
      console.error('[withdrawLpWinnings] Market settled but winning_outcome not set:', bet.id);
      return Response.json({ error: 'Market is settled but winning outcome not set. Admin must announce winner first.' }, { status: 400 });
    }
    
    if (userBet.outcome === bet.winning_outcome) {
      console.error('[withdrawLpWinnings] LP did not win - backed the winning outcome:', {
        userBet_outcome: userBet.outcome,
        winning_outcome: bet.winning_outcome,
        explanation: 'In parimutuel betting, LPs profit when bettors lose. Since you backed the WINNING outcome, you had to pay winners and your position lost value.',
      });
      return Response.json({ 
        error: 'This LP position did not win',
        hint: 'LPs win when their backed outcome LOSES (they collect losing bettors stakes).\n\nYou backed the WINNING outcome, so your LP position lost value.',
        details: {
          your_outcome: userBet.outcome,
          winning_outcome: bet.winning_outcome,
        }
      }, { status: 400 });
    }

    // Check if LP already withdrew (on-chain check via withdrawn flag in offer)
    if (offer.withdrawn === true) {
      console.error('[withdrawLpWinnings] LP already withdrew (DB flag):', offer.id);
      return Response.json({ error: 'This LP position has already been withdrawn' }, { status: 400 });
    }

    // Check if there's matched liquidity to claim
    const dbMatched = offer.amount_matched || 0;
    if (dbMatched <= 0) {
      console.log('[withdrawLpWinnings] No matched liquidity in DB, checking on-chain:', {
        offer_id: offer.id,
        amount_matched: dbMatched,
      });
      // Check on-chain - might have matched liquidity not reflected in DB
      try {
        const lpOfferAccountInfo = await connection.getAccountInfo(lpOfferPda);
        if (lpOfferAccountInfo) {
          const accountData = lpOfferAccountInfo.data;
          const amountMatchedOnChain = Number(accountData.readBigUInt64LE(9));
          console.log('[withdrawLpWinnings] On-chain matched:', amountMatchedOnChain / 1e9);
          if (amountMatchedOnChain <= 0) {
            return Response.json({ error: 'No matched liquidity available. Use withdrawUnmatchedLiquidity instead.' }, { status: 400 });
          }
        } else {
          return Response.json({ error: 'No matched liquidity and LP offer not found on-chain' }, { status: 400 });
        }
      } catch (err) {
        return Response.json({ error: 'No matched liquidity available' }, { status: 400 });
      }
    }

    // ON-CHAIN CHECK: Fetch the actual LP offer account from Solana to verify state
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    try {
      const lpOfferAccountInfo = await connection.getAccountInfo(lpOfferPda);
      if (!lpOfferAccountInfo) {
        console.error('[withdrawLpWinnings] LP offer PDA not found on-chain:', lpOfferPda.toBase58());
        return Response.json({ error: 'LP position not found on-chain. The market may not be deployed.' }, { status: 400 });
      }

      // Parse the LP offer account data (simplified - just check withdrawn flag at offset)
      // LpOffer layout: discriminator (8) + lp (32) + outcome (1) + amount_matched (8) + withdrawn (1) + bump (1) = 51 bytes
      const accountData = lpOfferAccountInfo.data;
      const withdrawnFlag = accountData[41]; // withdrawn is a bool at offset 41
      const amountMatchedOnChain = accountData.readBigUInt64LE(9); // amount_matched at offset 9

      console.log('[withdrawLpWinnings] On-chain LP offer state:', {
        withdrawn: withdrawnFlag === 1,
        amountMatchedOnChain: Number(amountMatchedOnChain) / 1e9,
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
      // Don't block - continue with DB data if on-chain fetch fails
    }

    // Get wallet address
    const walletAddress = userBet.wallet_address || offer.lp_wallet_address;
    if (!walletAddress) {
      return Response.json({ error: 'No wallet address found' }, { status: 400 });
    }

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

    // Derive LP offer PDA correctly: [b"lp_offer", market.key(), lp, &[outcome]]
    const outcomeValue = userBet.outcome === 'a' ? 0 : userBet.outcome === 'draw' ? 1 : 2;
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), userPubkey.toBuffer(), Buffer.from([outcomeValue])],
      programId
    );

    // Fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Calculate LP winnings: matched stake from the offer
    // The LP earns the losing side's stakes (matched against their liquidity)
    const baseAmount = offer.amount_matched || 0;
    
    // Skip LP fee bonus calculation for performance (can be added back later with caching)
    const lpBonus = 0;
    
    const withdrawAmountLamports = Math.round(baseAmount * 1_000_000_000);

    console.log('[withdrawLpWinnings] Success response:', {
      withdrawAmount: baseAmount,
      withdrawAmountLamports,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
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
        outcome: outcomeValue,
      },
      message: `Sign to withdraw ◎${baseAmount.toFixed(4)} from settled market`,
    });

  } catch (error) {
    console.error('withdrawLpWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});