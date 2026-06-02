import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// Create a new bet offer (P2P fixed-odds model)
// The LP/bettor puts up funds for a specific outcome at locked-in odds
// The offer sits unmatched until someone bets the other side

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { bet_id, match_id, outcome, amount, wallet_address } = body;

    if (!bet_id || !match_id || !outcome || !amount || amount <= 0) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!wallet_address) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // Verify wallet is authenticated (exists in User entity)
    const trimmedWallet = wallet_address.trim();
    console.log('[createBetOffer] Authenticating wallet:', trimmedWallet.slice(0, 8) + '...');
    
    const users = await base44.asServiceRole.entities.User.filter({ wallet_address: trimmedWallet });
    console.log('[createBetOffer] User lookup result:', users?.length || 0, 'users found');
    if (!users || users.length === 0) {
      console.error('[createBetOffer] Authentication failed - no user found for wallet');
      return Response.json({ error: 'Wallet not authenticated. Please sign in with your wallet first.' }, { status: 401 });
    }
    console.log('[createBetOffer] ✓ Authenticated user:', users[0].username);

    // Validate base58 format
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedWallet)) {
      console.error('[createBetOffer] Invalid wallet address:', trimmedWallet);
      const invalidChars = trimmedWallet.split('').filter(c => !/^[1-9A-HJ-NP-Za-km-z]$/.test(c));
      console.error('[createBetOffer] Invalid characters:', invalidChars.map((c, i) => `pos${i}:'${c}'(code${c.charCodeAt(0)})`).join(', '));
      return Response.json({ 
        error: 'Invalid wallet address format — contains non-base58 characters', 
        hint: 'Address must be 32-44 base58 characters. Invalid: ' + invalidChars.map(c => `'${c.char}'@${c.position}`).join(', '),
        debug: {
          address: trimmedWallet,
          length: trimmedWallet.length,
          invalidCharacters: invalidChars
        }
      }, { status: 400 });
    }

    // Try to create PublicKey to validate
    let lpPubkey;
    try {
      lpPubkey = new PublicKey(trimmedWallet);
    } catch (e) {
      console.error('[createBetOffer] PublicKey validation failed:', e.message);
      return Response.json({ 
        error: 'Invalid Solana wallet address', 
        hint: e.message,
        debug: { address: trimmedWallet }
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

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      console.error('[createBetOffer] SOLANA__PROGRAM_ID not set');
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }

    // Derive PDAs for provide_liquidity instruction
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'draw' ? 1 : 2;

    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    const amountLamports = Math.round(amount * 1_000_000_000);
    const max_liability = parseFloat((amount * (odds - 1)).toFixed(6));

    // Derive platform_config PDA
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_config')],
      programId
    );

    return Response.json({
      success: true,
      amount,
      odds,
      max_liability,
      solana_instruction: {
        instruction_type: 'provide_liquidity',
        programId: SOLANA_PROGRAM_ID,
        accounts: {
          market: marketPda.toBase58(),
          lpOffer: lpOfferPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        },
        outcome: outcomeIndex,
        amountLamports,
      },
      message: `Sign transaction to provide ◎${amount} liquidity on ${outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw'}`,
    });
  } catch (error) {
    console.error('[createBetOffer] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});