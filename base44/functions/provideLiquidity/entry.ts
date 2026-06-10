import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * provide_liquidity instruction builder
 * Discriminator: [40, 110, 107, 116, 174, 127, 97, 204]
 * Data: discriminator + 1 byte outcome (u8) + 8 bytes amount (u64 LE)
 * Accounts: market, lp_offer, lp, system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    
    const { walletAddress, bet_id, match_id, outcome, amount } = await req.json();

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!bet_id || !match_id || outcome === undefined || !amount) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (amount <= 0) return Response.json({ error: 'Amount must be positive' }, { status: 400 });

    // Validate outcome
    if (outcome !== 'a' && outcome !== 'b' && outcome !== 'draw') {
      return Response.json({ error: 'Invalid outcome' }, { status: 400 });
    }

    // Fetch Bet entity
    const bets = await serviceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') {
      return Response.json({ error: 'Bet not open' }, { status: 400 });
    }

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

    // Derive PDAs
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const lpPubkey = new PublicKey(walletAddress);
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

    // Verify market exists on-chain
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      return Response.json({ error: 'Market not found on-chain', marketPda: marketPda.toBase58() }, { status: 400 });
    }

    // Get odds from bet entity
    const oddsField = outcome === 'a' ? 'odds_a' : outcome === 'b' ? 'odds_b' : 'odds_draw';
    const oddsDecimal = bet[oddsField] || 2.0;
    const oddsBps = Math.round(oddsDecimal * 100);

    // Build instruction data: 8-byte discriminator + 1-byte outcome + 8-byte amount (u64 LE)
    const discriminator = Buffer.from([40, 110, 107, 116, 174, 127, 97, 204]);
    const instructionData = Buffer.alloc(17);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);
    instructionData.writeBigUInt64LE(BigInt(Math.round(amount * 1_000_000_000)), 9);

    console.log('[provideLiquidity] Discriminator (bytes):', Array.from(discriminator));
    console.log('[provideLiquidity] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[provideLiquidity] Instruction data (hex):', instructionData.toString('hex'));

    // Build accounts in exact order:
    // 1. market [writable]
    // 2. lp_offer [writable]
    // 3. lp [signer, writable]
    // 4. system_program [readonly]
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: lpOfferPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    console.log('[provideLiquidity] Accounts:');
    keys.forEach((k, i) => {
      console.log(`  [${i}] ${k.pubkey} (isSigner: ${k.isSigner}, isWritable: ${k.isWritable})`);
    });

    // Fetch match for display
    const matches = await serviceRole.entities.Match.filter({ id: match_id });
    const match = matches[0];

    // Prepare commit data
    const offerData = {
      bet_id,
      match_id,
      outcome,
      outcome_label: outcomeLabel,
      amount_offered: amount,
      amount_matched: 0,
      amount_unmatched: amount,
      status: 'open',
      odds_at_creation: oddsDecimal,
      lp_wallet_address: walletAddress,
      solana_bet_pool_pda: marketPda.toBase58(),
      solana_position_pda: lpOfferPda.toBase58(),
    };

    const commit_data = {
      offer: offerData,
      userBet: {
        bet_id,
        match_id,
        outcome,
        amount,
        role: 'lp',
        status: 'pending',
        outcome_label: outcomeLabel,
        match_title: match ? `${match.team_a} vs ${match.team_b}` : '',
        wallet_address: walletAddress,
      },
    };

    return Response.json({
      success: true,
      oddsBps,
      oddsDecimal,
      solana_instruction: {
        instruction_type: 'provide_liquidity',
        programId: SOLANA_PROGRAM_ID,
        keys,
        instruction_data: instructionData.toString('base64'),
      },
      commit_data,
      message: `✓ Ready to provide ◎${amount} at ${oddsDecimal}x for ${outcomeLabel}`,
    });

  } catch (error) {
    console.error('[provideLiquidity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});