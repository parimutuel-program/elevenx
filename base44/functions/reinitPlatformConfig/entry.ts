import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, SystemProgram, TransactionInstruction } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Re-initialize platform config with current wallet as admin.
 * This will CLOSE the existing platform account and create a new one.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized - please login' }, { status: 401 });
    }
    
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required', got_role: user.role }, { status: 403 });
    }

    const requestBody = await req.json();
    const { admin_wallet } = requestBody;
    
    if (!admin_wallet) {
      return Response.json({ error: 'Missing admin_wallet' }, { status: 400 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Build instruction data for initialize_platform: 8-byte discriminator + admin (32 bytes) + fee_percent (u16)
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const data = Buffer.alloc(41);
    discriminator.copy(data, 0);
    
    // Admin wallet (32 bytes)
    const adminBytes = Buffer.from(admin_wallet.replace('0x', ''), 'hex');
    if (adminBytes.length === 32) {
      adminBytes.copy(data, 8);
    } else {
      // Try base58 decode
      const { decode: bs58Decode } = await import('npm:bs58@5.0.0');
      const decoded = bs58Decode(admin_wallet);
      Buffer.from(decoded).copy(data, 8);
    }
    
    // fee_percent: 0 (u16 LE)
    data.writeUInt16LE(0, 40);

    console.log('[reinitPlatformConfig] Instruction data (hex):', data.toString('hex'));
    console.log('[reinitPlatformConfig] Admin wallet:', admin_wallet);
    console.log('[reinitPlatformConfig] Admin bytes (hex):', data.slice(8, 40).toString('hex'));

    return Response.json({
      success: true,
      message: 'Re-initialize platform config with new admin',
      solana_instruction: {
        instruction_type: 'initialize_platform',
        programId: SOLANA_PROGRAM_ID,
        accounts: {
          platformConfig: platformPda.toBase58(),
          feeVault: feeVaultPda.toBase58(),
        },
        instruction_data: data.toString('base64'),
      },
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
    });

  } catch (error) {
    console.error('reinitPlatformConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});