import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.wallet_address) {
      return Response.json({ error: 'Wallet not connected' }, { status: 400 });
    }

    const { bet_id, match_id, outcome, amount } = await req.json();

    if (!bet_id || !match_id || !outcome || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (amount <= 0) {
      return Response.json({ error: 'Amount must be positive' }, { status: 400 });
    }

    // Get the bet to verify it exists and is open
    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];

    if (!bet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    if (bet.status !== 'open') {
      return Response.json({ error: 'Bet is not open' }, { status: 400 });
    }

    // Get outcome label
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

    // Create the bet offer
    const offer = await base44.entities.BetOffer.create({
      bet_id,
      match_id,
      outcome,
      outcome_label: outcomeLabel,
      amount_offered: amount,
      amount_matched: 0,
      amount_unmatched: amount,
      status: 'open',
      odds_at_creation: 0, // Will be calculated based on liquidity
    });

    // Update bet liquidity
    const lpField = outcome === 'a' ? 'lp_amount_a' : outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
    await base44.entities.Bet.update(bet_id, {
      [lpField]: (bet[lpField] || 0) + amount,
    });

    // Create user bet record (LP role)
    const match = await base44.entities.Match.list().then(ms => ms.find(m => m.id === match_id));
    await base44.entities.UserBet.create({
      bet_id,
      match_id,
      offer_id: offer.id,
      outcome,
      amount,
      role: 'lp',
      status: 'pending',
      outcome_label: outcomeLabel,
      match_title: `${match.team_a} vs ${match.team_b}`,
      potential_payout: 0,
    });

    return Response.json({
      success: true,
      offer,
      message: 'Bet offer created successfully'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});