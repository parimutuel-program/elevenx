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
    const users = await base44.asServiceRole.entities.User.filter({ wallet_address: wallet_address.trim() });
    if (!users || users.length === 0) {
      return Response.json({ error: 'Wallet not authenticated. Please sign in with your wallet first.' }, { status: 401 });
    }

    // Trim whitespace
    const trimmedWallet = wallet_address.trim();
    
    // Validate base58 format - check each character
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedWallet)) {
      console.error('[createBetOffer] Invalid wallet address:', trimmedWallet);
      console.error('[createBetOffer] Length:', trimmedWallet.length);
      
      // Find invalid characters
      const invalidChars = [];
      for (let i = 0; i < trimmedWallet.length; i++) {
        const char = trimmedWallet[i];
        if (!/^[1-9A-HJ-NP-Za-km-z]$/.test(char)) {
          invalidChars.push({ position: i, char: char, code: char.charCodeAt(0) });
        }
      }
      console.error('[createBetOffer] Invalid characters:', invalidChars);
      
      return Response.json({ 
        error: 'Invalid wallet address format — contains non-base58 characters', 
        hint: 'Address must be 32-44 base58 characters. Invalid chars: ' + invalidChars.map(c => `'${c.char}'@${c.position}`).join(', '),
        debug: {
          address: trimmedWallet,
          length: trimmedWallet.length,
          invalidCharacters: invalidChars
        }
      }, { status: 400 });
    }

    // Try to create PublicKey to validate - this catches subtle base58 issues
    let lpPubkey;
    try {
      lpPubkey = new PublicKey(trimmedWallet);
    } catch (e) {
      console.error('[createBetOffer] PublicKey validation failed:', e.message);
      console.error('[createBetOffer] Address:', trimmedWallet);
      console.error('[createBetOffer] Char codes:', trimmedWallet.split('').map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(' '));
      return Response.json({ 
        error: 'Invalid Solana wallet address', 
        hint: e.message,
        debug: { 
          address: trimmedWallet,
          charCodes: trimmedWallet.split('').map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`)
        }
      }, { status: 400 });
    }

    // Load the bet/market
    console.log('[createBetOffer] Fetching bet with ID:', bet_id);
    console.log('[createBetOffer] Bet ID type:', typeof bet_id);
    console.log('[createBetOffer] Bet ID length:', bet_id?.length);
    
    let bet;
    try {
      const bets = await base44.entities.Bet.filter({ id: bet_id });
      console.log('[createBetOffer] Bet query result:', bets);
      bet = bets[0];
    } catch (fetchError) {
      console.error('[createBetOffer] Failed to fetch bet:', fetchError.message);
      console.error('[createBetOffer] Error type:', fetchError.constructor.name);
      console.error('[createBetOffer] Full error:', fetchError);
      return Response.json({ 
        error: 'Failed to load bet market', 
        details: fetchError.message,
        bet_id: bet_id,
        bet_id_type: typeof bet_id
      }, { status: 500 });
    }
    
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

    console.log('[createBetOffer] Program ID:', SOLANA_PROGRAM_ID);
    console.log('[createBetOffer] Program ID length:', SOLANA_PROGRAM_ID.length);
    
    // Validate program ID format (reuse existing regex)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(SOLANA_PROGRAM_ID)) {
      console.error('[createBetOffer] Invalid program ID format');
      console.error('[createBetOffer] Invalid chars:', SOLANA_PROGRAM_ID.split('').filter(c => !/^[1-9A-HJ-NP-Za-km-z]$/.test(c)));
      return Response.json({ 
        error: 'Invalid Solana program ID configuration',
        hint: 'Program ID contains non-base58 characters'
      }, { status: 500 });
    }

    // Derive PDAs for provide_liquidity instruction
    let programId;
    try {
      programId = new PublicKey(SOLANA_PROGRAM_ID);
      console.log('[createBetOffer] PublicKey created successfully:', programId.toBase58());
    } catch (e) {
      console.error('[createBetOffer] PublicKey constructor failed:', e.message);
      return Response.json({ 
        error: 'Invalid Solana program ID',
        details: e.message
      }, { status: 500 });
    }
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'draw' ? 1 : 2;
    // lpPubkey already declared above in validation

    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    const amountLamports = Math.round(amount * 1_000_000_000);

    // Max payout the offer creator could win = amount * odds
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
    console.error('[createBetOffer] Top-level catch:', error.message);
    console.error('[createBetOffer] Error stack:', error.stack);
    console.error('[createBetOffer] Error constructor:', error.constructor.name);
    return Response.json({ 
      error: error.message,
      error_type: error.constructor.name,
      stack: error.stack
    }, { status: 500 });
  }
});