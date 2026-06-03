import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Checks if a pari-mutuel market is properly initialized on-chain and whether it's settled.
 * Returns status: 'not_created' | 'not_initialized' | 'initialized' | 'settled'
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
    
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log('[checkMarketStatus] Checking account at PDA:', marketPda.toBase58());
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      console.log('[checkMarketStatus] Account NOT FOUND - status: not_created');
      return Response.json({
        status: 'not_created',
        marketPda: marketPda.toBase58(),
      });
    }
    
    console.log('[checkMarketStatus] Account FOUND:', {
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
    });
    
    // PoolMarket: 8 (discriminator) + 204 (struct) = 212 bytes
    const expectedMinSize = 212;
    const actualSize = accountInfo.data.length;
    
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
    
    // Parse the account data to read settled status
    // Layout: discriminator(8) + match_id(32) + outcome_names(96) + open_until(8) + settle_after(8) + 
    //         fee_percent(2) + outcome_count(1) + winning_outcome(1) + oracle_odds(24) + 
    //         total_matched(24) + total_pending(24) + total_lp_committed(8) + accrued_fees(8) + 
    //         settled(1) + voided(1) + paused(1) + settlement_finalized(1) + bump(1)
    const data = accountInfo.data;
    const settledOffset = 8 + 32 + 96 + 8 + 8 + 2 + 1 + 1 + 24 + 24 + 24 + 8 + 8; // 206
    const isSettled = data[settledOffset] === 1;
    const isVoided = data[settledOffset + 1] === 1;
    const isPaused = data[settledOffset + 2] === 1;
    const isSettlementFinalized = data[settledOffset + 3] === 1;
    
    // Read winning_outcome (at offset 8 + 32 + 96 + 8 + 8 + 2 + 1 = 155, but we already have it in the struct)
    const winningOutcomeOffset = 8 + 32 + 96 + 8 + 8 + 2 + 1; // offset 155
    const winningOutcome = data[winningOutcomeOffset]; // 0=a, 1=b, 2=draw
    
    console.log('[checkMarketStatus] Parsed account data:', {
      isSettled,
      isVoided,
      isPaused,
      isSettlementFinalized,
      winningOutcome,
    });
    
    console.log('Account properly initialized - status:', isSettled ? 'settled' : 'initialized');
    return Response.json({
      status: isSettled ? 'settled' : 'initialized',
      settled: isSettled,
      voided: isVoided,
      paused: isPaused,
      settlement_finalized: isSettlementFinalized,
      winning_outcome: winningOutcome,
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