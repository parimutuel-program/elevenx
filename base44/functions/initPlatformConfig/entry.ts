import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Initializes the platform config account on-chain.
 * Must be called once by admin before any markets can be created.
 */
Deno.serve(async (req) => {
  try {
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'SOLANA__PROGRAM_ID not configured' }, { status: 500 });
    }
    
    // Verify admin access via wallet auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing authentication token' }, { status: 401 });
    }
    
    const authToken = authHeader.replace('Bearer ', '');
    const parts = authToken.split('.');
    
    if (parts.length !== 3) {
      return Response.json({ error: 'Invalid token format' }, { status: 401 });
    }
    
    const { subtle } = await import('node:crypto');
    const encoder = new TextEncoder();
    
    try {
      const payloadBytes = bs58.decode(parts[1]);
      const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
      
      console.log('[initPlatformConfig] Decoded token payload:', payload);
      
      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        throw new Error('Token expired');
      }
      
      // Verify signature - re-create signature and compare
      const secretKey = Deno.env.get('BASE44_APP_ID') || 'elevenx-secret';
      const keyData = encoder.encode(secretKey);
      const key = await subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const expectedSignature = await subtle.sign(
        'HMAC',
        key,
        encoder.encode(`${parts[0]}.${parts[1]}`)
      );
      
      const actualSignature = bs58.decode(parts[2]);
      
      // Compare signatures
      const expectedArray = new Uint8Array(expectedSignature);
      const valid = expectedArray.length === actualSignature.length &&
        expectedArray.every((byte, i) => byte === actualSignature[i]);
      
      if (!valid) {
        console.error('[initPlatformConfig] Signature mismatch');
        throw new Error('Invalid token signature');
      }
      
      if (payload.role !== 'admin') {
        return Response.json({ error: 'Admin access required', got_role: payload.role }, { status: 403 });
      }
      
      console.log('[initPlatformConfig] ✓ Authenticated admin wallet:', payload.walletAddress);
      
    } catch (tokenErr) {
      console.error('[initPlatformConfig] Token verification failed:', tokenErr.message);
      return Response.json({ error: 'Invalid authentication token', details: tokenErr.message }, { status: 401 });
    }

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    // Derive platform config PDA (seed: "platform")
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Derive fee vault PDA (seed: "fee_vault")
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Check if already exists
    const accountInfo = await connection.getAccountInfo(platformConfigPda);
    if (accountInfo) {
      return Response.json({
        success: true,
        alreadyExists: true,
        platformConfigPda: platformConfigPda.toBase58(),
        message: 'Platform config already initialized',
      });
    }

    // Prepare initialize_platform instruction
    // Discriminator: SHA256("global:initialize_platform") - Anchor namespace
    const discriminator = Buffer.from(sha256("global:initialize_platform")).slice(0, 8);
    console.log('Initialize platform discriminator:', discriminator.toString('hex'));
    console.log('Discriminator length:', discriminator.length);

    // Initialize_platform params: only fee_percent (u16) per Rust definition
    // The Rust function signature: pub fn initialize_platform(ctx: Context<InitializePlatform>, fee_percent: u16)
    const paramsData = Buffer.alloc(2);
    paramsData.writeUInt16LE(200, 0); // 2% fee (200 basis points)

    const instructionData = Buffer.concat([discriminator, paramsData]);
    console.log('Total instruction data length:', instructionData.length);
    console.log('Params data (hex):', paramsData.toString('hex'));

    console.log('Platform config PDA:', platformConfigPda.toBase58());
    console.log('Fee vault PDA:', feeVaultPda.toBase58());
    
    return Response.json({
      success: true,
      alreadyExists: false,
      platformConfigPda: platformConfigPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      solana_instruction: {
        instruction_type: 'initialize_platform',
        programId: SOLANA_PROGRAM_ID,
        instruction_data: instructionData.toString('base64'),
        accounts: {
          platformConfig: platformConfigPda.toBase58(),
          feeVault: feeVaultPda.toBase58(),
          admin: '', // Frontend will populate with actual Solana pubkey from connected wallet
          systemProgram: '11111111111111111111111111111111',
        }
      },
      message: 'Sign to initialize platform config',
    });

  } catch (error) {
    console.error('initPlatformConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});