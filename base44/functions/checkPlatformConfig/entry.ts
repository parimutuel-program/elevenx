import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Check if platform config is properly initialized on-chain.
 */
Deno.serve(async (req) => {
  try {
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }
    
    const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive platform config PDA
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    const accountInfo = await connection.getAccountInfo(platformConfigPda);
    
    if (!accountInfo) {
      return Response.json({
        initialized: false,
        platformConfigPda: platformConfigPda.toBase58(),
        message: 'Platform config account does not exist',
      });
    }
    
    // PlatformConfig struct size should be 48 bytes:
    // 8 (discriminator) + 32 (admin) + 2 (fee_percent) + 2 (consensus_threshold) + 8 (total_fees_lamports) + 1 (bump) = 53 bytes
    // But with Anchor padding, it's typically 48-53 bytes
    
    console.log('[checkPlatformConfig] Account info:', {
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
      isProgramOwner: accountInfo.owner.equals(programId),
    });
    
    const discriminator = accountInfo.data.slice(0, 8).toString('hex');
    console.log('[checkPlatformConfig] Discriminator:', discriminator);
    
    // Check if owned by our program
    if (!accountInfo.owner.equals(programId)) {
      return Response.json({
        initialized: false,
        platformConfigPda: platformConfigPda.toBase58(),
        message: 'Account exists but not owned by our program',
        discriminator: discriminator,
        actualOwner: accountInfo.owner.toBase58(),
      });
    }
    
    // Parse the account data (skip 8-byte discriminator)
    const data = accountInfo.data;
    if (data.length < 43) {
      return Response.json({
        initialized: false,
        platformConfigPda: platformConfigPda.toBase58(),
        message: 'Account data too small',
        size: data.length,
        discriminator: discriminator,
      });
    }
    
    // Read fields (Anchor format)
    const adminBytes = data.slice(8, 40); // 32 bytes
    const adminHex = adminBytes.toString('hex');
    const adminBase58 = new PublicKey(adminBytes).toBase58();
    const feePercent = data.readUInt16LE(40);
    const consensusThreshold = data.readUInt16LE(42);
    
    return Response.json({
      initialized: true,
      platformConfigPda: platformConfigPda.toBase58(),
      admin: adminBase58,
      adminHex: adminHex,
      feePercent: feePercent,
      consensusThreshold: consensusThreshold,
      discriminator: discriminator,
      message: 'Platform config is properly initialized',
    });
    
  } catch (error) {
    console.error('checkPlatformConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});