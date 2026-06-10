import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * withdraw_fees instruction builder
 * Discriminator: [198, 212, 171, 109, 144, 215, 174, 89]
 * Data: discriminator + 8 bytes amount (u64 LE)
 * Accounts: fee_vault, platform_config, admin, system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    
    const { amount_lamports, admin_wallet } = await req.json();
    
    if (!amount_lamports || amount_lamports <= 0) {
      return Response.json({ error: 'amount_lamports must be > 0' }, { status: 400 });
    }
    
    if (!admin_wallet) {
      return Response.json({ error: 'admin_wallet required' }, { status: 400 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    // Derive PDAs
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Validate fee vault exists
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);
    if (!feeVaultInfo) {
      return Response.json({ error: 'Fee vault not found on-chain' }, { status: 400 });
    }

    if (amount_lamports > feeVaultInfo.lamports) {
      return Response.json({ 
        error: 'Insufficient funds in fee vault',
        requested: amount_lamports,
        available: feeVaultInfo.lamports,
      }, { status: 400 });
    }

    // Build instruction data: 8-byte discriminator + 8-byte amount (u64 LE)
    const discriminator = Buffer.from([198, 212, 171, 109, 144, 215, 174, 89]);
    const instructionData = Buffer.alloc(16);
    discriminator.copy(instructionData, 0);
    instructionData.writeBigUInt64LE(BigInt(amount_lamports), 8);

    console.log('[withdrawFees] Discriminator (bytes):', Array.from(discriminator));
    console.log('[withdrawFees] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[withdrawFees] Amount (lamports):', amount_lamports);

    // Build accounts in exact order:
    // 1. fee_vault [writable]
    // 2. platform_config [readonly]
    // 3. admin [signer, writable]
    // 4. system_program [readonly]
    const keys = [
      { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: admin_wallet, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    console.log('[withdrawFees] Accounts:');
    keys.forEach((k, i) => {
      console.log(`  [${i}] ${k.pubkey} (isSigner: ${k.isSigner}, isWritable: ${k.isWritable})`);
    });

    return Response.json({
      success: true,
      amount_lamports,
      amount_sol: amount_lamports / 1e9,
      solana_instruction: {
        instruction_type: 'withdraw_fees',
        programId: SOLANA_PROGRAM_ID,
        keys,
        instruction_data: instructionData.toString('base64'),
      },
    });

  } catch (error) {
    console.error('[withdrawFees] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});