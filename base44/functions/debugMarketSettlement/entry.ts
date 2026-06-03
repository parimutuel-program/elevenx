import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Debug market account data to diagnose settlement issues.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const { bet_id } = payload;
    
    if (!bet_id) {
      return Response.json({ error: 'bet_id required' }, { status: 400 });
    }
    
    const bets = await serviceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });
    
    const matches = await serviceRole.entities.Match.filter({ id: bet.match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });
    
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive market PDA
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match.id.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    
    // Fetch account info
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      return Response.json({
        error: 'Market account not found on-chain',
        derived_pda: marketPda.toBase58(),
        stored_pda: bet.solana_market_pda || null,
        match_id: match.id,
        hint: 'Market may not be initialized yet',
      });
    }
    
    // Parse account data (BetMarket structure)
    // Layout: discriminator(8) + match_id(32) + admin(32) + open_until(i64) + settle_after(i64) + ...
    const data = accountInfo.data;
    console.log('[debugMarketSettlement] Account data length:', data.length);
    
    // Extract key fields
    const discriminator = data.slice(0, 8).toString('hex');
    const storedMatchId = data.slice(8, 40).toString('utf-8').replace(/\0/g, '');
    const openUntil = data.readBigInt64LE(72);
    const settleAfter = data.readBigInt64LE(80);
    const settled = data[96] === 1;
    const voided = data[97] === 1;
    const settlementFinalized = data[98] === 1;
    
    const clock = Math.floor(Date.now() / 1000);
    const canSettle = clock >= Number(settleAfter);
    
    // Extract admin pubkey from account data (bytes 40-72 based on CreateMarket struct)
    const adminBytes = data.slice(40, 72);
    const adminPubkey = new PublicKey(adminBytes);
    
    // Safe date conversion
    const safeDate = (ns: number) => {
      if (!ns || ns <= 0 || ns > BigInt('9999999999999')) return 'Invalid timestamp';
      return new Date(Number(ns) * 1000).toISOString();
    };
    
    return Response.json({
      success: true,
      market_pda: marketPda.toBase58(),
      account_exists: true,
      account_lamports: accountInfo.lamports,
      data_length: data.length,
      discriminator: discriminator,
      stored_match_id: storedMatchId,
      db_match_id: match.id,
      match_ids_match: storedMatchId === match.id,
      admin_pubkey: adminPubkey.toBase58(),
      open_until: safeDate(Number(openUntil)),
      settle_after: safeDate(Number(settleAfter)),
      current_time: new Date(clock * 1000).toISOString(),
      can_settle: canSettle,
      settled: settled,
      voided: voided,
      settlement_finalized: settlementFinalized,
      stored_pda: bet.solana_market_pda || null,
    });
    
  } catch (error) {
    console.error('debugMarketSettlement error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});