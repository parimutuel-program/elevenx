import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Checks if a market is properly initialized on-chain.
 * Returns status: 'not_created' | 'not_initialized' | 'initialized'
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }
    
    const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    
    const payload = await req.json();
    const { match_id } = payload;
    
    if (!match_id) {
      return Response.json({ error: 'Missing match_id' }, { status: 400 });
    }
    
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));
    
    // Derive market PDA
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      // Market doesn't exist on-chain
      return Response.json({
        status: 'not_created',
        marketPda: marketPda.toBase58(),
      });
    }
    
    // Market exists, check if it's properly initialized
    // BetMarket should be at least 288 bytes (based on the struct definition)
    const expectedSize = 288;
    const actualSize = accountInfo.data.length;
    
    if (actualSize < expectedSize) {
      // Account exists but is not properly initialized (size 0 or too small)
      return Response.json({
        status: 'not_initialized',
        marketPda: marketPda.toBase58(),
        actualSize,
        expectedSize,
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toBase58(),
      });
    }
    
    // Try to deserialize the account data to verify it's a valid BetMarket
    // For now, just check the size - if it's large enough, assume it's initialized
    return Response.json({
      status: 'initialized',
      marketPda: marketPda.toBase58(),
      size: actualSize,
      lamports: accountInfo.lamports,
    });
    
  } catch (error) {
    console.error('checkMarketStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});