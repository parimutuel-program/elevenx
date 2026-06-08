import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Check on-chain state of an LP offer before allowing withdrawal.
 * Returns the actual on-chain state to prevent "Nothing to claim" errors.
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
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    // Must be LP role
    if (userBet.role !== 'lp') {
      return Response.json({ error: 'Only LP positions can withdraw' }, { status: 400 });
    }

    // Fetch BetOffer to get the PDA
    if (!userBet.offer_id) {
      return Response.json({ error: 'LP offer not found' }, { status: 400 });
    }
    
    const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
    const offer = offers[0];
    if (!offer) {
      return Response.json({ error: 'BetOffer not found' }, { status: 404 });
    }

    // Check on-chain state using the stored PDA
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    try {
      // Use stored PDA or derive it
      let lpOfferPda;
      if (offer.solana_position_pda) {
        lpOfferPda = new PublicKey(offer.solana_position_pda);
      } else {
        // Fallback: derive from Bet's market PDA
        const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
        const bet = bets[0];
        if (!bet || !bet.solana_market_pda) {
          return Response.json({ error: 'Market PDA not found', canClaim: false, reason: 'not_found_on_chain' });
        }
        const marketPda = new PublicKey(bet.solana_market_pda);
        const lpPubkey = new PublicKey(userBet.wallet_address);
        const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
        const [derivedPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
          new PublicKey(SOLANA_PROGRAM_ID)
        );
        lpOfferPda = derivedPda;
      }
      
      const lpOfferAccountInfo = await connection.getAccountInfo(lpOfferPda);
      
      if (!lpOfferAccountInfo) {
        return Response.json({ 
          error: 'LP position not found on-chain',
          canClaim: false,
          reason: 'not_found_on_chain'
        }, { status: 200 });
      }

      // Parse the LP offer account data
      // LpOffer layout: discriminator (8) + market (32) + lp (32) + outcome (1) + odds_bps (8) + amount_committed (8) + amount_matched (8) + closed (1) + matched_stake (8) + withdrawn (1) + bump (1) = 108 bytes
      // Offsets: 0-7=disc, 8-39=market, 40-71=lp, 72=outcome, 73-80=odds_bps, 81-88=amount_committed, 89-96=amount_matched, 97=closed, 98-105=matched_stake, 106=withdrawn, 107=bump
      const accountData = lpOfferAccountInfo.data;
      const storedOutcome = accountData[72]; // outcome is stored at offset 72
      const fullyWithdrawnFlag = accountData[114]; // fully_withdrawn bool at offset 114 (NEW LAYOUT)
      const withdrawnAmountOnChain = accountData.readBigUInt64LE(106); // withdrawn_amount u64 at offset 106 (NEW LAYOUT)
      const amountMatchedOnChain = accountData.readBigUInt64LE(89); // amount_matched at offset 89

      const derivedOutcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
      
      console.log('[checkLpOfferOnChain] On-chain state:', {
        withdrawn: fullyWithdrawnFlag === 1,
        amountMatchedOnChain: Number(amountMatchedOnChain) / 1e9,
        lpOfferPda: lpOfferPda.toBase58(),
        stored_pda: offer.solana_position_pda,
        accountDataLength: accountData.length,
        storedOutcome,
        derivedOutcome: derivedOutcomeIndex,
        outcomeMatch: storedOutcome === derivedOutcomeIndex,
        userBet_outcome: userBet.outcome,
      });

      if (fullyWithdrawnFlag === 1) {
        return Response.json({ 
          error: 'LP position already fully withdrawn on-chain',
          canClaim: false,
          reason: 'already_withdrawn',
          onChainState: {
            fullyWithdrawn: true,
            withdrawnAmount: Number(withdrawnAmountOnChain) / 1e9,
            amountMatched: Number(amountMatchedOnChain) / 1e9,
          }
        }, { status: 200 });
      }

      // Check if there's ANY liquidity (matched OR the account exists)
      // For unmatched withdrawals, we just need the account to exist and not be withdrawn
      const hasMatched = Number(amountMatchedOnChain) > 0;
      
      // Position exists and not withdrawn - can attempt withdrawal
      return Response.json({
        canClaim: true,
        hasMatched,
        onChainState: {
          withdrawn: false,
          amountMatched: Number(amountMatchedOnChain) / 1e9,
        },
        message: hasMatched ? 'LP position has winnings to claim' : 'LP position exists, can withdraw unmatched'
      });

    } catch (onChainErr) {
      console.error('[checkLpOfferOnChain] Failed to fetch on-chain state:', onChainErr.message);
      return Response.json({ 
        error: 'Failed to fetch on-chain state: ' + onChainErr.message,
        canClaim: false,
        reason: 'fetch_error'
      }, { status: 200 });
    }

  } catch (error) {
    console.error('checkLpOfferOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});