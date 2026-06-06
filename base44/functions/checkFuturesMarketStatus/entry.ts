import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Checks if a futures market is properly initialized on-chain.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }
    
    const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    
    const payload = await req.json();
    const { futures_market_id } = payload;
    
    if (!futures_market_id) {
      return Response.json({ error: 'Missing futures_market_id' }, { status: 400 });
    }
    
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive PDA using futures market ID as seed (same as createFuturesMarketOnChain)
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(futures_market_id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(futures_market_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketIdBytes],
      programId
    );
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log('[checkFuturesMarketStatus] Checking account at PDA:', marketPda.toBase58());
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      console.log('[checkFuturesMarketStatus] Account NOT FOUND - status: not_created');
      return Response.json({
        status: 'not_created',
        marketPda: marketPda.toBase58(),
        message: 'Futures market account does not exist on-chain',
      });
    }
    
    console.log('[checkFuturesMarketStatus] Account FOUND:', {
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
    });
    
    // BetMarket: 8 (discriminator) + 204 (struct) = 212 bytes minimum
    const expectedMinSize = 210;
    const actualSize = accountInfo.data.length;
    
    if (actualSize < expectedMinSize) {
      console.log('[checkFuturesMarketStatus] Account too small - size:', actualSize, 'expected:', expectedMinSize);
      return Response.json({
        status: 'not_initialized',
        marketPda: marketPda.toBase58(),
        actualSize,
        expectedMinSize,
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toBase58(),
        message: 'Account exists but is not properly initialized',
      });
    }
    
    // Parse account data to check status
    const data = accountInfo.data;
    const settledOffset = 244;
    const isSettled = data[settledOffset] === 1;
    const isVoided = data[settledOffset + 1] === 1;
    const isPaused = data[settledOffset + 2] === 1;
    
    return Response.json({
      status: 'initialized',
      settled: isSettled,
      voided: isVoided,
      paused: isPaused,
      marketPda: marketPda.toBase58(),
      size: actualSize,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
      message: 'Futures market is properly initialized on-chain',
    });
    
  } catch (error) {
    console.error('checkFuturesMarketStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});