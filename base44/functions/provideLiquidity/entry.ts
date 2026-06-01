import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || 'YOUR_PROGRAM_ID_HERE';

/**
 * LP provides fixed-odds liquidity for a specific outcome.
 * Returns the Solana instruction for the frontend to sign.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { walletAddress, bet_id, match_id, outcome, amount } = payload;

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!bet_id || !match_id || outcome === undefined || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount <= 0) return Response.json({ error: 'Amount must be positive' }, { status: 400 });

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') return Response.json({ error: 'Bet not open' }, { status: 400 });

    // Derive outcome index (0=a, 1=draw, 2=b)
    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'draw' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

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

    // Get oracle odds from bet entity
    const oddsField = outcome === 'a' ? 'oracle_odds_a' : outcome === 'b' ? 'oracle_odds_b' : 'oracle_odds_draw';
    const oddsBps = bet[oddsField] || 200; // fallback to 2.00x

    // Record in BetOffer entity
    const existingOffers = await base44.entities.BetOffer.filter({ bet_id, lp_wallet_address: walletAddress, outcome });
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

    return Response.json({
      success: true,
      offerId: offer.id,
      oddsBps,
      solana_instruction: {
        instruction_type: 'provide_liquidity',
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
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