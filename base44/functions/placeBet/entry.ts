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

    // ── PARIMUTUEL MODE: Auto-create LP offer for the bettor (self-backed bet) ──────────────────
    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';
    const matches = await base44.entities.Match.filter({ id: match_id });
    const match = matches[0];

    const bettorPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    // Parimutuel: Bettor IS the LP - create LP offer PDA using bettor's own address
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );
    const [bettorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );

    console.log('[placeBet] Parimutuel bet (self-backed LP):', {
      bettor: walletAddress,
      outcome,
      outcomeIndex,
      amount,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      bettorPositionPda: bettorPositionPda.toBase58(),
    });

    // Prepare commit data — create LP offer + user bet (parimutuel: bettor IS the LP)
    const commit_data = {
      lpOffer: {
        bet_id,
        match_id,
        outcome,
        outcome_label: outcomeLabel,
        amount_offered: amount, // LP offers the same amount they're betting
        amount_matched: 0,
        amount_unmatched: amount,
        status: 'open',
        odds_at_creation: 0, // Parimutuel
        lp_wallet_address: walletAddress,
        solana_bet_pool_pda: marketPda.toBase58(),
        solana_position_pda: lpOfferPda.toBase58(),
      },
      userBet: {
        bet_id,
        match_id,
        offer_id: null, // CRITICAL: null for parimutuel - no separate offer created
        outcome,
        amount,
        role: 'lp', // CRITICAL: This is an LP position, not a matcher bet
        status: 'active',
        outcome_label: outcomeLabel,
        match_title: match ? `${match.team_a} vs ${match.team_b}` : '',
        potential_payout: 0,
        wallet_address: walletAddress,
        // LP-specific fields
        liquidity_deposited: amount,
        liquidity_matched: 0,
        liquidity_unmatched: amount,
        _isParimutuel: true, // CRITICAL: Flag for UI to treat as bet, not LP position
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
      odds: 0, // Parimutuel - odds determined at settlement
      potentialPayout: 0,
      lp_offer_id: 'TEMP',
      commit_data,
      solana_instruction: {
        instruction_type: 'place_bet',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(), // Use bettor's own LP offer PDA
        bettorPositionPda: bettorPositionPda.toBase58(),
        outcome: outcomeIndex,
        amountLamports: Math.round(amount * 1_000_000_000),
      },
      message: `✓ Ready to bet ◎${amount} on ${outcomeLabel} (parimutuel) — sign to confirm`,
    });

  } catch (error) {
    console.error('placeBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});