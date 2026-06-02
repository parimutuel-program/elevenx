import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Initializes the platform config account on-chain.
 * Must be called once by admin before any markets can be created.
 */
Deno.serve(async (req) => {
  try {
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'SOLANA__PROGRAM_ID not configured' }, { status: 500 });
    }
    
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    // Derive platform config PDA (seed: "platform")
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
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
    // Discriminator: SHA256("global:initialize_platform")
    const discriminator = Buffer.from(sha256("global:initialize_platform")).slice(0, 8);
    console.log('Initialize platform discriminator:', discriminator.toString('hex'));
    console.log('Discriminator length:', discriminator.length);

    // Initialize_platform params based on PlatformConfig struct:
    // - default_fee_percent: u16
    // - max_fee_percent: u16  
    const paramsData = Buffer.alloc(4);
    let offset = 0;
    
    // default_fee_percent (u16 = 2 bytes) - 2% default (200 basis points)
    paramsData.writeUInt16LE(200, offset);
    offset += 2;
    
    // max_fee_percent (u16 = 2 bytes) - 5% max (500 basis points)
    paramsData.writeUInt16LE(500, offset);
    offset += 2;

    const instructionData = Buffer.concat([discriminator, paramsData]);
    console.log('Total instruction data length:', instructionData.length);
    console.log('Params data (hex):', paramsData.toString('hex'));

    const adminPubkey = user.id; // We'll need to get the actual Solana pubkey from frontend
    console.log('Platform config PDA:', platformConfigPda.toBase58());
    
    return Response.json({
      success: true,
      alreadyExists: false,
      platformConfigPda: platformConfigPda.toBase58(),
      solana_instruction: {
        instruction_type: 'initialize_platform',
        programId: SOLANA_PROGRAM_ID,
        instruction_data: instructionData.toString('base64'),
        accounts: {
          platformConfig: platformConfigPda.toBase58(),
          admin: adminPubkey, // Frontend will replace with actual Solana pubkey
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