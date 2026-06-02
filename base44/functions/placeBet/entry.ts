import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Bettor places a fixed-odds bet matched against available LP liquidity.
 * Returns the Solana instruction for the frontend to sign.
 *
 * Hybrid model:
 *   - Odds are fixed at time of bet (from oracle_odds on the Bet entity).
 *   - potential_payout = stake * odds (locked in immediately if matched).
 *   - If no LP liquidity, stake goes pending.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
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
    
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { walletAddress, bet_id, match_id, outcome, amount } = payload;

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

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'draw' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

    // Get oracle odds for this outcome (stored in basis points × 100, e.g. 210 = 2.10x)
    const oddsField = outcome === 'a' ? 'oracle_odds_a' : outcome === 'b' ? 'oracle_odds_b' : 'oracle_odds_draw';
    const oddsBps = bet[oddsField] || 200;
    const oddsMultiplier = oddsBps / 100;

    // Find best available LP offer for this outcome
    const offers = await base44.entities.BetOffer.filter({ bet_id, outcome });
    const availableOffer = offers.find(o =>
      (o.status === 'open' || o.status === 'partially_matched') &&
      (o.amount_unmatched || 0) > 0
    );

    const matchedAmount = availableOffer
      ? Math.min(amount, availableOffer.amount_unmatched || 0)
      : 0;
    const pendingAmount = amount - matchedAmount;
    const potentialPayout = matchedAmount * oddsMultiplier;

    const match = await base44.entities.Match.list().then(ms => ms.find(m => m.id === match_id));

    // Derive PDAs
    const bettorPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );

    // LP offer PDA (use the matched offer's LP wallet)
    let lpOfferPda = null;
    if (availableOffer?.lp_wallet_address) {
      const lpPubkey = new PublicKey(availableOffer.lp_wallet_address);
      [lpOfferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
        programId
      );
    }

    // Update LP offer matched amounts
    if (availableOffer && matchedAmount > 0) {
      const newMatched = (availableOffer.amount_matched || 0) + matchedAmount;
      const newUnmatched = (availableOffer.amount_unmatched || 0) - matchedAmount;
      await base44.entities.BetOffer.update(availableOffer.id, {
        amount_matched: newMatched,
        amount_unmatched: newUnmatched,
        status: newUnmatched <= 0 ? 'fully_matched' : 'partially_matched',
      });
    }

    // Update bet matched/pending totals
    const matchedField = outcome === 'a' ? 'backed_amount_a' : outcome === 'b' ? 'backed_amount_b' : 'backed_amount_draw';
    await base44.entities.Bet.update(bet_id, {
      [matchedField]: (bet[matchedField] || 0) + matchedAmount,
      total_pool: (bet.total_pool || 0) + amount,
      total_bettors: (bet.total_bettors || 0) + 1,
    });

    // Create UserBet record
    const userBet = await base44.entities.UserBet.create({
      bet_id,
      match_id,
      offer_id: availableOffer?.id || null,
      outcome,
      amount,
      role: 'matcher',
      status: matchedAmount > 0 ? 'active' : 'pending',
      outcome_label: outcomeLabel,
      match_title: `${match?.team_a} vs ${match?.team_b}`,
      potential_payout: potentialPayout,
    });

    return Response.json({
      success: true,
      userBetId: userBet.id,
      matchedAmount,
      pendingAmount,
      potentialPayout,
      oddsBps,
      oddsMultiplier,
      status: matchedAmount > 0 ? 'active' : 'pending',
      solana_instruction: {
        instruction_type: 'place_bet',
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda?.toBase58() || null,
        bettorPositionPda: positionPda.toBase58(),
        outcome: outcomeIndex,
        amountLamports: Math.round(amount * 1_000_000_000),
      },
      message: matchedAmount > 0
        ? `Sign to lock ◎${amount} at ${oddsMultiplier}x — win ◎${potentialPayout.toFixed(4)}`
        : `Sign to place ◎${amount} (pending — waiting for LP liquidity)`,
    });

  } catch (error) {
    console.error('placeBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});