import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

// Cache platform admin check (5 minute TTL)
const platformCache = new Map();
const CACHE_TTL_MS = 300000;

/**
 * Debug function to check the admin address stored in PlatformConfig PDA
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Check cache first
    const cached = platformCache.get('platform_admin');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('[debugPlatformAdmin] Cache HIT');
      return Response.json(cached.data);
    }
    console.log('[debugPlatformAdmin] Cache MISS');
    
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive platform config PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    // Fetch account data from Solana with retry
    const connection = new (await import('npm:@solana/web3.js@1.98.4')).Connection('https://api.devnet.solana.com', 'confirmed');
    let accountInfo = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        accountInfo = await connection.getAccountInfo(platformPda);
        break;
      } catch (rpcError) {
        lastError = rpcError;
        if (rpcError.message?.includes('429')) {
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }
        } else {
          throw rpcError;
        }
      }
    }
    if (!accountInfo && lastError) {
      throw lastError;
    }
    
    if (!accountInfo) {
      return Response.json({ 
        error: 'Platform config not initialized',
        platformPda: platformPda.toBase58(),
      }, { status: 404 });
    }
    
    // Parse PlatformConfig account data
    // Layout: discriminator (8) + admin (32) + fee_percent (2) + consensus_threshold (2) + bumps (3) = 47 bytes
    const data = Buffer.from(accountInfo.data);
    console.log('[debugPlatformAdmin] Account data length:', data.length);
    console.log('[debugPlatformAdmin] Account data (hex):', data.toString('hex'));
    
    if (data.length < 42) {
      return Response.json({ 
        error: 'Invalid account data size',
        got_size: data.length,
        expected_size: 47,
      }, { status: 500 });
    }
    
    // Extract admin pubkey (bytes 8-40)
    const adminBytes = data.slice(8, 40);
    const adminPubkey = new PublicKey(adminBytes);
    const adminAddress = adminPubkey.toBase58();
    
    // Extract fee_percent (bytes 40-42, u16 LE)
    const feePercent = data.readUInt16LE(40);
    
    // Extract consensus_threshold (bytes 42-44, u16 LE) - if exists
    const consensusThreshold = data.length >= 44 ? data.readUInt16LE(42) : 3;
    
    const result = {
      success: true,
      platformPda: platformPda.toBase58(),
      admin: adminAddress,
      feePercent,
      consensusThreshold,
      accountSize: data.length,
    };
    
    // Cache the result
    platformCache.set('platform_admin', {
      data: result,
      timestamp: Date.now(),
    });
    
    return Response.json(result);
    
  } catch (error) {
    console.error('debugPlatformAdmin error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});