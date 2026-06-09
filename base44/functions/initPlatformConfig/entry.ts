import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, SystemProgram, TransactionInstruction } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Initialize platform config on Solana (one-time setup).
 */
Deno.serve(async (req) => {
  const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
  if (!SOLANA_PROGRAM_ID) {
    return Response.json({ error: 'SOLANA_PROGRAM_ID secret not configured' }, { status: 500 });
  }
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Get wallet address from request payload (set by frontend after Phantom connects)
    const requestBody = await req.json();
    const walletAddress = requestBody.walletAddress;
    console.log('[initPlatformConfig] Wallet address from payload:', walletAddress);
    
    if (!walletAddress) {
      console.error('[initPlatformConfig] No wallet address in request');
      return Response.json({ error: 'Unauthorized - wallet address required. Please connect Phantom wallet first.' }, { status: 401 });
    }
    
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: walletAddress });
    const walletUser = walletUsers[0];
    
    if (!walletUser) {
      return Response.json({ error: 'Wallet user not found' }, { status: 404 });
    }
    
    // Check admin role directly from WalletUser
    if (walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin access required', got_role: walletUser.role }, { status: 403 });
    }

    const connection = {
      rpcUrl: 'https://api.devnet.solana.com',
    };

    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    // Derive platform config PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Derive fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Check if account already exists
    const accountInfo = await fetch(`${connection.rpcUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [platformPda.toBase58()],
      }),
    }).then(r => r.json());

    const alreadyExists = accountInfo.result?.value !== null;

    if (alreadyExists) {
      return Response.json({
        alreadyExists: true,
        message: 'Platform config already initialized',
        platformPda: platformPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
      });
    }

    // Build instruction data: 8-byte discriminator + fee_percent (u16) = 10 bytes
    // Use snake_case to match the on-chain program instruction name
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const data = Buffer.alloc(10);
    discriminator.copy(data, 0);
    
    // fee_percent: 0 (u16 LE) at offset 8
    data.writeUInt16LE(0, 8);

    console.log('[initPlatformConfig] Instruction data (hex):', data.toString('hex'));

    return Response.json({
      success: true,
      message: 'Initialize platform config on Solana',
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
    console.error('initPlatformConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});