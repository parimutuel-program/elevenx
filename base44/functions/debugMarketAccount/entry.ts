import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Debug function to check market account details on-chain.
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
    
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    let marketPda;
    
    // Special case: check platform config instead of market
    if (match_id === 'platform') {
      const [platformConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('platform')],
        programId
      );
      marketPda = platformConfigPda;
      console.log('[debugMarketAccount] Checking platform config PDA:', marketPda.toBase58());
    } else {
      if (!match_id) {
        return Response.json({ error: 'Missing match_id' }, { status: 400 });
      }
      
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));
      
      // Derive market PDA
      const [marketPdaDerived] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), matchIdBytes],
        programId
      );
      marketPda = marketPdaDerived;
      console.log('[debugMarketAccount] Checking market PDA:', marketPda.toBase58());
    }
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log('[debugMarketAccount] Checking account at PDA:', marketPda.toBase58());
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      console.log('[debugMarketAccount] Account does not exist');
      return Response.json({
        exists: false,
        marketPda: marketPda.toBase58(),
        message: 'Account does not exist on-chain',
      });
    }
    
    console.log('[debugMarketAccount] Account exists:', {
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
    });
    
    // Try to parse the first 8 bytes as discriminator
    const discriminator = accountInfo.data.slice(0, 8);
    console.log('[debugMarketAccount] Discriminator (hex):', discriminator.toString('hex'));
    
    // Parse BetMarket fields from account data
    const d = accountInfo.data;
    let parsed = null;
    if (d.length >= 249) {
      const open_until = Number(d.readBigInt64LE(136));
      const settle_after = Number(d.readBigInt64LE(144));
      const fee_percent = d.readUInt16LE(152);
      const outcome_count = d[154];
      const winning_outcome = d[155];
      // oracle_odds: 3 x u64 at offset 156
      const odds = [0,1,2].map(i => Number(d.readBigUInt64LE(156 + i*8)));
      // total_matched: 3 x u64 at offset 180
      const total_matched = [0,1,2].map(i => Number(d.readBigUInt64LE(180 + i*8)));
      // total_lp_committed at 204, accrued_fees at 212
      const total_lp_committed = Number(d.readBigUInt64LE(204));
      const accrued_fees = Number(d.readBigUInt64LE(212));
      const settled = d[220] === 1;
      const voided = d[221] === 1;
      const paused = d[222] === 1;
      const settlement_finalized = d[223] === 1;
      const bump = d[224];
      const now = Math.floor(Date.now() / 1000);
      parsed = {
        open_until, open_until_date: new Date(open_until * 1000).toISOString(),
        settle_after, settle_after_date: new Date(settle_after * 1000).toISOString(),
        can_settle_now: now >= settle_after,
        now_unix: now,
        fee_percent, outcome_count, winning_outcome,
        oracle_odds: odds,
        total_matched,
        total_lp_committed, accrued_fees,
        settled, voided, paused, settlement_finalized, bump,
      };
    }

    return Response.json({
      exists: true,
      marketPda: marketPda.toBase58(),
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
      discriminatorHex: discriminator.toString('hex'),
      dataSample: accountInfo.data.slice(0, 64).toString('hex'),
      parsed,
    });
    
  } catch (error) {
    console.error('debugMarketAccount error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});