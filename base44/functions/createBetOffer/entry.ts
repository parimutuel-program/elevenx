import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// Create a new bet offer (P2P fixed-odds model)
// The LP/bettor puts up funds for a specific outcome at locked-in odds
// The offer sits unmatched until someone bets the other side

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { bet_id, match_id, outcome, amount, wallet_address } = body;

    if (!bet_id || !match_id || !outcome || !amount || amount <= 0) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!wallet_address) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // Validate base58 format
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(wallet_address)) {
      console.error('[createBetOffer] Invalid wallet address:', wallet_address);
      console.error('[createBetOffer] Failed regex test');
      return Response.json({ 
        error: 'Invalid wallet address format — contains non-base58 characters', 
        hint: 'Address must be 32-44 base58 characters',
        debug: {
          address: wallet_address,
          length: wallet_address.length,
          passedRegex: base58Regex.test(wallet_address)
        }
      }, { status: 400 });
    }

    // Try to create PublicKey to validate
    try {
      new PublicKey(wallet_address);
    } catch (e) {
      console.error('[createBetOffer] PublicKey validation failed:', e.message, 'for address:', wallet_address);
      return Response.json({ 
        error: 'Invalid Solana wallet address', 
        hint: e.message,
        debug: { address: wallet_address }
      }, { status: 400 });
    }

    // Load the bet/market
    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet market not found' }, { status: 404 });
    if (bet.status !== 'open') return Response.json({ error: 'Market is not open' }, { status: 400 });

    // Get the odds for this outcome
    let odds = 0;
    if (outcome === 'a') odds = bet.odds_a || 0;
    else if (outcome === 'b') odds = bet.odds_b || 0;
    else if (outcome === 'draw') odds = bet.odds_draw || 0;

    if (!odds || odds <= 1) return Response.json({ error: 'No valid odds for this outcome' }, { status: 400 });

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }

    // Derive PDAs for provide_liquidity instruction
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pm_market'), matchIdBytes],
      programId
    );

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'draw' ? 1 : 2;
    const lpPubkey = new PublicKey(wallet_address);

    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pm_position'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    const amountLamports = Math.round(amount * 1_000_000_000);

    // Max payout the offer creator could win = amount * odds
    const max_liability = parseFloat((amount * (odds - 1)).toFixed(6));

    return Response.json({
      success: true,
      amount,
      odds,
      max_liability,
      solana_instruction: {
        instruction_type: 'provide_liquidity',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        outcome: outcomeIndex,
        amountLamports,
      },
      message: `Sign transaction to provide ◎${amount} liquidity on ${outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw'}`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});