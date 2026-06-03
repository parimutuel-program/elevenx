import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Place a bet on a futures market outcome
 * Creates UserBet record and returns instruction for on-chain transaction
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { marketId, outcome, amount } = await req.json();
    
    if (!marketId || !outcome || !amount || amount <= 0) {
      return Response.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Get futures market
    const market = await base44.entities.FuturesMarket.get(marketId);
    if (!market) {
      return Response.json({ error: 'Market not found' }, { status: 404 });
    }

    if (market.status !== 'open') {
      return Response.json({ error: 'Market is not open for betting' }, { status: 400 });
    }

    // Find the specific outcome
    const selectedOutcome = market.outcomes.find(o => o.position === outcome.position);
    if (!selectedOutcome) {
      return Response.json({ error: 'Outcome not found' }, { status: 404 });
    }

    const potentialPayout = amount * selectedOutcome.odds;

    // Create UserBet record
    const userBet = await base44.entities.UserBet.create({
      bet_id: market.id, // Using market ID as bet reference for futures
      match_id: null, // Futures don't have match_id
      offer_id: null, // Will be set after on-chain matching
      role: 'matcher',
      outcome: outcome.position === '1st' ? 'a' : outcome.position === '2nd' ? 'b' : 'draw',
      amount,
      potential_payout: potentialPayout,
      actual_payout: 0,
      status: 'pending', // Pending until on-chain transaction confirms
      outcome_label: `${market.country} - ${outcome.position} Place`,
      match_title: `${market.country} ${outcome.position} Place`,
      wallet_address: null, // Will be set after wallet connection
    });

    // Get program ID from secrets
    const PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!PROGRAM_ID) {
      return Response.json({ error: 'SOLANA__PROGRAM_ID not configured' }, { status: 500 });
    }

    // Generate PDAs for futures market (simplified - actual PDA generation should match Rust)
    // For now, using placeholder PDAs - these need to match the on-chain program structure
    const marketPda = market.solana_market_pda || 'FuturesMarketPDA';
    const bettorPositionPda = `FuturesPosition_${userBet.id}`;
    
    // Calculate lamports (1 SOL = 1,000,000,000 lamports)
    const amountLamports = Math.floor(amount * 1e9);

    // Build instruction data for place_bet
    // Anchor discriminator (8 bytes) + outcome (u8) + amount (u64 LE) = 17 bytes
    const disc = await anchorDiscriminator('place_bet');
    const data = Buffer.alloc(17);
    disc.copy(data, 0);
    
    // Map outcome position to u8 (0=a, 1=b, 2=draw)
    const outcomeIndex = outcome.position === '1st' ? 0 : outcome.position === '2nd' ? 1 : 2;
    data.writeUInt8(outcomeIndex, 8);
    data.writeBigUInt64LE(BigInt(amountLamports), 9);

    return Response.json({
      success: true,
      userBetId: userBet.id,
      instruction: {
        instruction_type: 'place_bet',
        programId: PROGRAM_ID,
        marketPda,
        lpOfferPda: marketPda, // Using market PDA as placeholder for LP offer
        bettorPositionPda,
        amountLamports,
        outcome: outcomeIndex,
      },
      market,
      outcome: selectedOutcome,
      potentialPayout,
    });

  } catch (error) {
    console.error('placeFuturesBet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Compute Anchor 8-byte discriminator: SHA256("global:<name>").slice(0, 8)
async function anchorDiscriminator(name) {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  const buffer = new Uint8Array(hash).slice(0, 8);
  return Buffer.from(buffer);
}