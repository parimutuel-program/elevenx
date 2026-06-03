import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Fixed-odds betting — LP liquidity REQUIRED.
 * Finds an open LP offer for the chosen outcome, derives the real lp_offer PDA,
 * and returns the Solana instruction for the bettor to sign.
 * DB writes happen AFTER the transaction succeeds via commitBet.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
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

    // ── FIXED-ODDS: Require a real LP offer for this outcome ──────────────────
    const allOffers = await serviceRole.entities.BetOffer.filter({ bet_id, outcome });
    const lpOffer = allOffers.find(o =>
      (o.status === 'open' || o.status === 'partially_matched') &&
      (o.amount_unmatched || 0) > 0
    );

    if (!lpOffer) {
      return Response.json({
        error: `No liquidity available for this outcome. An LP must provide liquidity for "${outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw'}" before bets can be placed.`,
        hint: 'Ask the LP to provide liquidity first via the LP Dashboard.',
      }, { status: 400 });
    }

    if (amount > (lpOffer.amount_unmatched || 0)) {
      return Response.json({
        error: `Bet amount (◎${amount}) exceeds available liquidity (◎${lpOffer.amount_unmatched.toFixed(4)}) for this outcome.`,
        hint: 'Try a smaller amount or wait for more liquidity.',
      }, { status: 400 });
    }

    // Get odds for this outcome from the LP offer or bet
    const oddsDecimal = lpOffer.odds_at_creation ||
      (outcome === 'a' ? bet.odds_a : outcome === 'b' ? bet.odds_b : bet.odds_draw) || 2.0;

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';
    const potentialPayout = parseFloat((amount * oddsDecimal).toFixed(6));

    const matches = await base44.entities.Match.filter({ id: match_id });
    const match = matches[0];

    // Derive PDAs using the REAL LP wallet (fixed-odds model)
    const bettorPubkey = new PublicKey(walletAddress);
    const lpPubkey = new PublicKey(lpOffer.lp_wallet_address);
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
    const [bettorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );

    console.log('[placeBet] Fixed-odds bet:', {
      bettor: walletAddress,
      lp: lpOffer.lp_wallet_address,
      outcome,
      outcomeIndex,
      amount,
      odds: oddsDecimal,
      potentialPayout,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      bettorPositionPda: bettorPositionPda.toBase58(),
    });

    // Prepare commit data — DB writes happen AFTER transaction succeeds
    const newMatchedAmount = (lpOffer.amount_matched || 0) + amount;
    const newUnmatchedAmount = (lpOffer.amount_unmatched || 0) - amount;
    const newOfferStatus = newUnmatchedAmount <= 0 ? 'fully_matched' : 'partially_matched';

    const commit_data = {
      userBet: {
        bet_id,
        match_id,
        offer_id: lpOffer.id,
        outcome,
        amount,
        role: 'matcher',
        status: 'active',
        outcome_label: outcomeLabel,
        match_title: match ? `${match.team_a} vs ${match.team_b}` : '',
        potential_payout: potentialPayout,
        wallet_address: walletAddress,
      },
      offerUpdate: {
        id: lpOffer.id,
        amount_matched: newMatchedAmount,
        amount_unmatched: newUnmatchedAmount,
        status: newOfferStatus,
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
      lp_offer_id: lpOffer.id,
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
      message: `✓ Ready to bet ◎${amount} on ${outcomeLabel} at ${oddsDecimal}x (potential ◎${potentialPayout}) — sign to confirm`,
    });

  } catch (error) {
    console.error('placeBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});