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
    // BetMarket layout: winning_outcome at offset 155, settled at 276, voided at 277
    const data = accountInfo.data;
    const WINNING_OUTCOME_OFFSET = 155;
    const SETTLED_OFFSET = 276;
    const VOIDED_OFFSET = 277;
    
    const isSettled = data.length > SETTLED_OFFSET ? data[SETTLED_OFFSET] === 1 : false;
    const isVoided = data.length > VOIDED_OFFSET ? data[VOIDED_OFFSET] === 1 : false;
    const winningOutcome = data.length > WINNING_OUTCOME_OFFSET ? data[WINNING_OUTCOME_OFFSET] : 0; // 0=1st, 1=2nd, 2=3rd
    const isPaused = false;
    
    console.log('[checkFuturesMarketStatus] Parsed:', {
      isSettled,
      isVoided,
      winningOutcome,
      settled_byte: data[SETTLED_OFFSET],
      voided_byte: data[VOIDED_OFFSET],
      winning_outcome_byte: data[WINNING_OUTCOME_OFFSET],
    });
    
    return Response.json({
      status: isSettled ? 'settled' : 'initialized',
      settled: isSettled,
      voided: isVoided,
      paused: isPaused,
      winning_outcome: winningOutcome,
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