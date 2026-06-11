import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL') || '';
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID') || '';
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * create_market instruction builder
 * Discriminator: [103, 226, 97, 235, 200, 188, 251, 254]
 * Accounts: market, vote_tally, platform_config, admin, system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { rpcUrl, programIdStr, programId, connection } = getSolanaConfig();

    const { bet_id, match_id } = await req.json();
    if (!bet_id || !match_id) {
      return Response.json({ error: 'Missing bet_id or match_id' }, { status: 400 });
    }

    const bets = await base44.asServiceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await base44.asServiceRole.entities.Match.filter({ id: match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
    const [voteTallyPda] = PublicKey.findProgramAddressSync([Buffer.from('vote_tally'), marketPda.toBuffer()], programId);
    const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId); // kept for response metadata only

    // Check platform init
    const platformInfo = await connection.getAccountInfo(platformPda);
    if (!platformInfo) {
      // Return platform init instruction
      const initDisc = Buffer.from(sha256('global:initialize_platform')).slice(0, 8);
      const initParams = Buffer.alloc(3);
      initParams.writeUInt16LE(200, 0);
      initParams.writeUInt8(51, 2);
      const initData = Buffer.concat([initDisc, initParams]);
      return Response.json({
        success: true, needsPlatformInit: true,
        marketPda: marketPda.toBase58(), platformPda: platformPda.toBase58(), feeVaultPda: feeVaultPda.toBase58(),
        solana_instruction: {
          instruction_type: 'initialize_platform',
          programId: programIdStr,
          instruction_data: initData.toString('base64'),
          accounts: { platformConfig: platformPda.toBase58(), feeVault: feeVaultPda.toBase58(), admin: 'SIGNER_WALLET' },
        },
        message: 'Initialize platform first, then create market',
      });
    }

    const openUntil = Math.floor(new Date(bet.open_until).getTime() / 1000);
    // settle_after MUST be strictly greater than open_until
    const settleAfter = openUntil + 60;

    // Outcome names: each exactly 32 bytes, zero-padded
    const outcomeNames = ['A', 'B', 'Draw'].map((fallback, i) => {
      const src = [bet.outcome_a, bet.outcome_b, bet.outcome_draw][i] || fallback;
      const buf = Buffer.alloc(32);
      Buffer.from(src, 'utf-8').copy(buf, 0, 0, Math.min(src.length, 32));
      return buf;
    });

    // fee_percent_override: Option<u16> — must be ≤ 200
    const feeRaw = Math.min(bet.fee_percent || 200, 200);
    // Encode as Some(feeRaw): 1 byte (0x01) + u16 LE (2 bytes) = 3 bytes
    const feeOptionBuf = Buffer.alloc(3);
    feeOptionBuf.writeUInt8(1, 0);
    feeOptionBuf.writeUInt16LE(feeRaw, 1);

    // oracle_odds: each must be > 100 (100 = 1.0x). Ensure minimum of 101.
    const oddsA = Math.max(Math.round((bet.odds_a || 2.0) * 100), 101);
    const oddsB = Math.max(Math.round((bet.odds_b || 2.0) * 100), 101);
    const oddsDraw = Math.max(Math.round((bet.odds_draw || 3.0) * 100), 101);

    console.log('[createMarketOnChain] openUntil:', openUntil, 'settleAfter:', settleAfter);
    console.log('[createMarketOnChain] odds (bps):', oddsA, oddsB, oddsDraw);
    console.log('[createMarketOnChain] feeRaw:', feeRaw);

    // Build instruction data:
    // 8 (discriminator) + 32 (match_id) + 96 (3x outcome names) + 8 (open_until) + 8 (settle_after)
    // + 3 (Option<u16> fee) + 1 (outcome_count) + 24 (3x u64 odds) = 180 bytes
    const paramsData = Buffer.alloc(172);
    let offset = 0;
    matchIdBytes.copy(paramsData, offset); offset += 32;
    outcomeNames[0].copy(paramsData, offset); offset += 32;
    outcomeNames[1].copy(paramsData, offset); offset += 32;
    outcomeNames[2].copy(paramsData, offset); offset += 32;
    paramsData.writeBigInt64LE(BigInt(openUntil), offset); offset += 8;
    paramsData.writeBigInt64LE(BigInt(settleAfter), offset); offset += 8;
    feeOptionBuf.copy(paramsData, offset); offset += 3;
    paramsData.writeUInt8(3, offset); offset += 1; // outcome_count = 3
    paramsData.writeBigUInt64LE(BigInt(oddsA), offset); offset += 8;
    paramsData.writeBigUInt64LE(BigInt(oddsB), offset); offset += 8;
    paramsData.writeBigUInt64LE(BigInt(oddsDraw), offset); offset += 8;

    const discriminator = Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]);
    const instructionData = Buffer.concat([discriminator, paramsData]);

    console.log('[createMarketOnChain] programId:', programIdStr, 'rpcUrl:', rpcUrl);
    console.log('[createMarketOnChain] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[createMarketOnChain] Market PDA:', marketPda.toBase58());

    // Accounts: market, vote_tally, platform_config, admin [signer], system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: voteTallyPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: platformPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ];

    // Also provide named accounts object — required by SolanaTransactionSigner create_market handler
    const accounts = {
      market: marketPda.toBase58(),
      voteTally: voteTallyPda.toBase58(),
      platformConfig: platformPda.toBase58(),
      admin: 'SIGNER_WALLET',
      systemProgram: SystemProgram.programId.toBase58(),
    };

    console.log('[createMarketOnChain] Instruction data length:', instructionData.length, '(expected 180)');

    return Response.json({
      success: true, needsPlatformInit: false,
      marketPda: marketPda.toBase58(), platformPda: platformPda.toBase58(), feeVaultPda: feeVaultPda.toBase58(),
      solana_instruction: {
        instruction_type: 'create_market',
        programId: programIdStr,
        keys,
        accounts,
        instruction_data: instructionData.toString('base64'),
      },
      message: 'Sign transaction to create market',
    });
  } catch (error) {
    console.error('[createMarketOnChain] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});