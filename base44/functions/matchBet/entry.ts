import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// Match against an existing offer — bettor takes the opposing side
// Bettor stakes at opposing odds: if LP offered Home @ 2.0, bettor bets Away
// LP's liability covers bettor's winnings

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { offer_id, amount, wallet_address } = body;

    if (!offer_id || !amount || amount <= 0) {
      return Response.json({ error: 'Missing offer_id or amount' }, { status: 400 });
    }

    if (!wallet_address) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // Validate base58 format
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(wallet_address)) {
      return Response.json({ 
        error: 'Invalid wallet address format — contains non-base58 characters', 
        hint: 'Address must be 32-44 base58 characters'
      }, { status: 400 });
    }

    // Load offer
    const offers = await base44.entities.BetOffer.filter({ id: offer_id });
    const offer = offers[0];
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    if (offer.status === 'cancelled' || offer.status === 'fully_matched') {
      return Response.json({ error: 'Offer is no longer available' }, { status: 400 });
    }

    // Load bet/market
    const bets = await base44.entities.Bet.filter({ id: offer.bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') return Response.json({ error: 'Market not open' }, { status: 400 });

    const lp_odds = offer.odds_at_creation;
    const max_stake = offer.amount_unmatched / (lp_odds - 1);
    
    if (amount > max_stake) {
      return Response.json({ error: `Maximum stake for this offer is ◎${max_stake.toFixed(4)}` }, { status: 400 });
    }

    // Determine opposing outcome
    let matcher_outcome = '';
    if (offer.outcome === 'a') matcher_outcome = 'b';
    else if (offer.outcome === 'b') matcher_outcome = 'a';
    else matcher_outcome = 'a';

    const matcher_outcome_label = matcher_outcome === 'a' ? bet.outcome_a : matcher_outcome === 'b' ? bet.outcome_b : 'Draw';
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
      [Buffer.from('pm_market'), matchIdBytes],
      programId
    );

    const bettorPubkey = new PublicKey(wallet_address);
    const outcomeIndex = matcher_outcome === 'a' ? 0 : matcher_outcome === 'draw' ? 1 : 2;

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pm_position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    const amountLamports = Math.round(amount * 1_000_000_000);

    return Response.json({
      success: true,
      potential_payout,
      matcher_outcome_label,
      solana_instruction: {
        instruction_type: 'place_bet',
        marketPda: marketPda.toBase58(),
        bettorPositionPda: positionPda.toBase58(),
        outcome: outcomeIndex,
        amountLamports,
      },
      message: `Sign to bet ◎${amount.toFixed(4)} on ${matcher_outcome_label} to win ◎${potential_payout.toFixed(4)}`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});