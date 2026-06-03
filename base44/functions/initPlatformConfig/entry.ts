import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, SystemProgram, TransactionInstruction } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Initialize platform config on Solana (one-time setup).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Get wallet address from request header (set by frontend after wallet auth)
    const authHeader = req.headers.get('Authorization') || '';
    const walletToken = authHeader.replace('Bearer ', '');
    
    if (!walletToken) {
      return Response.json({ error: 'Unauthorized - no auth token' }, { status: 401 });
    }
    
    // Decode wallet token to get user info
    const [headerPart, payloadPart, signaturePart] = walletToken.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      return Response.json({ error: 'Invalid token format' }, { status: 401 });
    }
    
    // Decode payload (base58)
    const decoder = new TextDecoder();
    let tokenPayload;
    try {
      tokenPayload = JSON.parse(decoder.decode(bs58.decode(payloadPart)));
    } catch (e) {
      console.error('Token decode error:', e);
      return Response.json({ error: 'Failed to decode token' }, { status: 401 });
    }
    
    console.log('[initPlatformConfig] Token payload:', tokenPayload);
    
    // Get user from database by wallet address
    const walletAddress = tokenPayload.walletAddress;
    if (!walletAddress) {
      return Response.json({ error: 'Invalid token - no wallet address' }, { status: 401 });
    }
    
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: walletAddress });
    const walletUser = walletUsers[0];
    
    if (!walletUser) {
      return Response.json({ error: 'Wallet user not found' }, { status: 404 });
    }
    
    // Get full user record
    const users = await serviceRole.entities.User.filter({ id: walletUser.id });
    const user = users[0];
    
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required', got_role: user.role }, { status: 403 });
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

    // Build instruction data: 8-byte discriminator + admin + fee_percent + consensus_threshold
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const data = Buffer.alloc(41);
    discriminator.copy(data, 0);
    
    // For now, use placeholder admin (will be set by first signer)
    const adminPlaceholder = new Array(32).fill(0);
    Buffer.from(adminPlaceholder).copy(data, 8);
    
    // fee_percent: 0 (u16 LE)
    data.writeUInt16LE(0, 40);

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