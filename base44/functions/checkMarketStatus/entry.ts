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
    console.log('Checking account at PDA:', marketPda.toBase58());
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      console.log('Account not found - status: not_created');
      return Response.json({
        status: 'not_created',
        marketPda: marketPda.toBase58(),
      });
    }
    
    console.log('Account found:', {
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
    });
    
    // Market exists, check if it's properly initialized
    // BetMarket: 8 (discriminator) + 244 (struct) = 252 bytes
    const expectedMinSize = 250;
    const actualSize = accountInfo.data.length;
    
    console.log('Account size check:', { actualSize, expectedMinSize, isInitialized: actualSize >= expectedMinSize });
    
    if (actualSize < expectedMinSize) {
      console.log('Account too small - status: not_initialized');
      return Response.json({
        status: 'not_initialized',
        marketPda: marketPda.toBase58(),
        actualSize,
        expectedMinSize,
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toBase58(),
      });
    }
    
    console.log('Account properly initialized - status: initialized, size:', actualSize);
    return Response.json({
      status: 'initialized',
      marketPda: marketPda.toBase58(),
      size: actualSize,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
    });
    
  } catch (error) {
    console.error('checkMarketStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});