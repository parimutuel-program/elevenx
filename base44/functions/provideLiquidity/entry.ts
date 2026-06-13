import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * provide_liquidity instruction builder
 * Discriminator: [40, 110, 107, 116, 174, 127, 97, 204]
 * Data: discriminator + outcome (u8) + amount (u64 LE)
 * Accounts: market, lp_offer, lp, system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const { rpcUrl, programIdStr, programId, connection } = getSolanaConfig();

    const { walletAddress, bet_id, match_id, outcome, amount: rawAmount } = await req.json();
    const amount = parseFloat(rawAmount);

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!bet_id || !match_id || outcome === undefined || rawAmount === undefined || rawAmount === null || rawAmount === '') {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (isNaN(amount) || amount <= 0) return Response.json({ error: 'Amount must be a positive number' }, { status: 400 });
    if (outcome !== 'a' && outcome !== 'b' && outcome !== 'draw') {
      return Response.json({ error: 'Invalid outcome' }, { status: 400 });
    }

    const bets = await serviceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') {
      return Response.json({ error: 'Bet not open' }, { status: 400 });
    }

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

    const lpPubkey = new PublicKey(walletAddress);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])], programId
    );

    // Verify market exists on-chain
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      return Response.json({ error: 'Market not found on-chain', marketPda: marketPda.toBase58() }, { status: 400 });
    }

    const oddsDecimal = bet[outcome === 'a' ? 'odds_a' : outcome === 'b' ? 'odds_b' : 'odds_draw'] || 2.0;
    const oddsBps = Math.round(oddsDecimal * 100);

    const discriminator = Buffer.from([40, 110, 107, 116, 174, 127, 97, 204]);
    const instructionData = Buffer.alloc(17);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);
    instructionData.writeBigUInt64LE(BigInt(Math.round(amount * 1_000_000_000)), 9);

    console.log('[provideLiquidity] programId:', programIdStr, 'rpcUrl:', rpcUrl);
    console.log('[provideLiquidity] Discriminator (hex):', discriminator.toString('hex'));

    // Accounts: market, lp_offer, lp, system_program (lp NOT signer - prevents Phantom security warning)
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: lpOfferPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: false, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];
    console.log('[provideLiquidity] Accounts:', keys.map((k, i) => `[${i}] ${k.pubkey}`));

    const matches = await serviceRole.entities.Match.filter({ id: match_id });
    const match = matches[0];

    const commit_data = {
      offer: {
        bet_id, match_id, outcome, outcome_label: outcomeLabel,
        amount_offered: amount, amount_matched: 0, amount_unmatched: amount,
        status: 'open', odds_at_creation: oddsDecimal,
        lp_wallet_address: walletAddress,
        solana_bet_pool_pda: marketPda.toBase58(),
        solana_position_pda: lpOfferPda.toBase58(),
      },
      userBet: {
        bet_id, match_id, outcome, amount, role: 'lp', status: 'pending',
        outcome_label: outcomeLabel,
        match_title: match ? `${match.team_a} vs ${match.team_b}` : '',
        wallet_address: walletAddress,
      },
    };

    return Response.json({
      success: true, oddsBps, oddsDecimal, commit_data,
      solana_instruction: {
        instruction_type: 'provide_liquidity',
        programId: programIdStr,
        keys,
        instruction_data: instructionData.toString('base64'),
      },
      message: `✓ Ready to provide ◎${amount} at ${oddsDecimal}x for ${outcomeLabel}`,
    });
  } catch (error) {
    console.error('[provideLiquidity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});