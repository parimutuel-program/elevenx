import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

/**
 * Comprehensive diagnostic tool to check platform and market status.
 * Helps identify why initialization is failing.
 */
Deno.serve(async (req) => {
  try {
    const SOLANA_PROGRAM_ID = Deno.env.get('ELEVENX_PROGRAM_ID');
    const SOLANA_RPC_URL = Deno.env.get('SOLANA_RPC_URL');
    if (!SOLANA_PROGRAM_ID) return Response.json({ error: 'ELEVENX_PROGRAM_ID secret not configured' }, { status: 500 });
    if (!SOLANA_RPC_URL) return Response.json({ error: 'SOLANA_RPC_URL secret not configured' }, { status: 500 });
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    console.log('[diagnosePlatform] Using program ID:', SOLANA_PROGRAM_ID);

    // Check platform config
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    const platformInfo = await connection.getAccountInfo(platformPda);
    const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);

    const platformExists = platformInfo !== null;
    const feeVaultExists = feeVaultInfo !== null;

    let platformDetails = null;
    let feeVaultDetails = null;

    if (platformExists && platformInfo.owner.equals(programId)) {
      const data = platformInfo.data;
      // Read as signed i64 (the on-chain type), then clamp negatives to 0
      const rawFeesBig = data.readBigInt64LE(44);
      const totalFeesLamports = rawFeesBig < 0n ? 0 : Number(rawFeesBig);
      platformDetails = {
        admin: new PublicKey(data.slice(8, 40)).toBase58(),
        fee_percent: data.readUInt16LE(40),
        consensus_threshold: data.readUInt16LE(42),
        total_fees_lamports: totalFeesLamports,
        total_fees_sol: (totalFeesLamports / 1e9).toFixed(6),
        discriminator: data.slice(0, 8).toString('hex'),
      };
    }

    if (feeVaultExists && feeVaultInfo.owner.equals(programId)) {
      const data = feeVaultInfo.data;
      feeVaultDetails = {
        admin: new PublicKey(data.slice(8, 40)).toBase58(),
        total_fees: Number(data.readBigUInt64LE(40)),
        discriminator: data.slice(0, 8).toString('hex'),
      };
    }

    return Response.json({
      programId: SOLANA_PROGRAM_ID,
      platform: {
        exists: platformExists,
        pda: platformPda.toBase58(),
        isOwnedByProgram: platformExists ? platformInfo.owner.equals(programId) : false,
        details: platformDetails,
      },
      feeVault: {
        exists: feeVaultExists,
        pda: feeVaultPda.toBase58(),
        isOwnedByProgram: feeVaultExists ? feeVaultInfo.owner.equals(programId) : false,
        details: feeVaultDetails,
      },
      summary: {
        isFullyInitialized: platformExists && feeVaultExists,
        canInitialize: !platformExists && !feeVaultExists,
        needsAction: platformExists && !feeVaultExists ? 'fee_vault_missing' : 
                     !platformExists && feeVaultExists ? 'platform_missing' :
                     platformExists && feeVaultExists ? 'already_initialized' : 'fresh_install',
      },
      recommendation: platformExists && feeVaultExists 
        ? '✅ Platform is fully initialized. You can start creating markets.'
        : platformExists && !feeVaultExists
        ? '⚠️ Platform config exists but fee vault is missing. This may cause issues.'
        : !platformExists && feeVaultExists
        ? '⚠️ Fee vault exists but platform config is missing. This may cause issues.'
        : '📝 Platform is not initialized. Click "Initialize Platform V2" to set up.',
    });

  } catch (error) {
    console.error('diagnosePlatform error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});