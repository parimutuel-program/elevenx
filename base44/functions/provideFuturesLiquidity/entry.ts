import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// Provides liquidity for futures markets (tournament winners, player awards).
// LP bets AGAINST a specific outcome (e.g., against Brazil winning World Cup).
// Uses REAL Solana PDA derivation for on-chain compatibility.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { walletAddress, market_id, outcome_label, odds, amount } = await req.json();

    if (!walletAddress || !market_id || !outcome_label || !odds || !amount) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'SOLANA_PROGRAM_ID not configured' }, { status: 500 });
    }

    // Fetch futures market
    const market = await base44.entities.FuturesMarket.get(market_id);
    if (!market) {
      return Response.json({ error: 'Futures market not found' }, { status: 404 });
    }

    if (market.status !== 'open') {
      return Response.json({ error: 'Market is not open for liquidity' }, { status: 400 });
    }

    // Find the outcome in the market to get the correct index (0, 1, or 2)
    const outcomeIndex = market.outcomes?.findIndex(o => o.label === outcome_label);
    if (outcomeIndex === -1 || outcomeIndex === undefined) {
      return Response.json({ error: 'Outcome not found in market outcomes' }, { status: 404 });
    }

    // Convert amount to lamports (1 SOL = 1e9 lamports)
    const amountLamports = Math.floor(amount * 1e9);

    // Derive REAL on-chain Solana PDAs
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const lpPubkey = new PublicKey(walletAddress);
    
    // Derive market PDA
    const marketIdBytes = Buffer.from(market_id.padEnd(32, '\0').slice(0, 32));
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketIdBytes],
      programId
    );
    
    // Derive LP offer PDA
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    // Derive platform config PDA
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Create UserBet record for LP using standard hex id (auto-generated)
    const userBet = await base44.entities.UserBet.create({
      bet_id: market_id,
      match_id: market_id,
      offer_id: "", // Will be linked during commit once BetOffer is created
      role: 'lp',
      outcome: outcomeIndex === 0 ? 'a' : outcomeIndex === 1 ? 'b' : 'draw',
      amount: amount,
      potential_payout: amount * odds,
      status: 'pending',
      outcome_label: outcome_label,
      match_title: market.title,
      wallet_address: walletAddress,
    });

    // Build valid Solana provide_liquidity instruction
    const instruction = {
      instruction_type: 'provide_liquidity',
      programId: SOLANA_PROGRAM_ID,
      accounts: {
        market: marketPda.toBase58(),
        lpOffer: lpOfferPda.toBase58(),
        platformConfig: platformConfigPda.toBase58(),
      },
      outcome: outcomeIndex,
      amountLamports: amountLamports,
    };

    return Response.json({
      success: true,
      solana_instruction: instruction,
      commit_data: {
        userBetId: userBet.id,
        market_id,
        outcome_label,
        amount,
        odds,
        walletAddress,
        solana_position_pda: lpOfferPda.toBase58(),
        solana_bet_pool_pda: marketPda.toBase58(),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});