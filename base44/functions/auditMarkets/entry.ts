import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

function getSolanaConfig() {
  let rawUrl = Deno.env.get('SOLANA_RPC_URL') || '';
  if (rawUrl.includes('RPC_URL=')) {
    rawUrl = rawUrl.split('RPC_URL=')[1].trim();
  }
  if (!rawUrl.startsWith('http') || rawUrl.includes('uuid')) {
    rawUrl = 'https://api.mainnet-beta.solana.com';
  }
  const rpcUrl = rawUrl;
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID') || '';
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * Parse u64 from buffer at given offset (little-endian)
 */
function readU64LE(buffer, offset) {
  const slice = buffer.slice(offset, offset + 8);
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(slice[i]) << BigInt(i * 8);
  }
  return value;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Admin auth check
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') isAdmin = true;
    } catch (_) {}

    if (!isAdmin) {
      try {
        const authHeader = req.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');
        if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.walletAddress) {
              const walletUsers = await base44.asServiceRole.entities.WalletUser.filter({ wallet_address: payload.walletAddress });
              if (walletUsers[0]?.role === 'admin') isAdmin = true;
            }
          }
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { programId, connection } = getSolanaConfig();
    
    console.log('[auditMarkets] Starting audit...');
    
    // Get all bets and matches
    const allBets = await base44.asServiceRole.entities.Bet.filter({});
    const allMatches = await base44.asServiceRole.entities.Match.filter({});
    
    // Create match lookup
    const matchMap = {};
    allMatches.forEach(m => {
      matchMap[m.id] = m;
    });
    
    const auditResults = [];
    let needsDeploy = 0;
    let deadBroken = 0;
    let liveGood = 0;
    let liveBad = 0;
    let notFound = 0;
    
    // Process bets with PDA
    const betsWithPda = allBets.filter(b => b.solana_market_pda);
    const betsNoPda = allBets.filter(b => !b.solana_market_pda);
    
    console.log(`[auditMarkets] Total bets: ${allBets.length}, With PDA: ${betsWithPda.length}, Without PDA: ${betsNoPda.length}`);
    
    // Bets without PDA = needs_deploy
    for (const bet of betsNoPda) {
      auditResults.push({
        bet_id: bet.id,
        match_id: bet.match_id,
        match_name: matchMap[bet.match_id] ? `${matchMap[bet.match_id].team_a} vs ${matchMap[bet.match_id].team_b}` : 'Unknown Match',
        market_pda: null,
        status: 'needs_deploy',
        oracle_odds: null,
        pda_broken: false,
      });
      needsDeploy++;
    }
    
    // Audit bets with PDA
    for (const bet of betsWithPda) {
      try {
        const marketPda = new PublicKey(bet.solana_market_pda);
        const accountInfo = await connection.getAccountInfo(marketPda);
        
        if (!accountInfo || accountInfo.data.length === 0) {
          // Account doesn't exist on-chain
          auditResults.push({
            bet_id: bet.id,
            match_id: bet.match_id,
            match_name: matchMap[bet.match_id] ? `${matchMap[bet.match_id].team_a} vs ${matchMap[bet.match_id].team_b}` : 'Unknown Match',
            market_pda: bet.solana_market_pda,
            status: 'needs_deploy',
            oracle_odds: null,
            pda_broken: false,
          });
          needsDeploy++;
          
          // Flag in DB
          await base44.asServiceRole.entities.Bet.update(bet.id, {
            solana_market_created: false,
          });
          
          console.log(`[auditMarkets] ✗ ${bet.id}: PDA not found on-chain`);
          continue;
        }
        
        // Account exists - parse oracle_odds
        // oracle_odds: [u64; 3] at byte offset 140 (after market struct fields)
        // Each u64 is 8 bytes little-endian
        const oddsOffset = 140;
        const oracleOdds = [
          readU64LE(accountInfo.data, oddsOffset),
          readU64LE(accountInfo.data, oddsOffset + 8),
          readU64LE(accountInfo.data, oddsOffset + 16),
        ];
        
        const oddsNumbers = oracleOdds.map(o => Number(o));
        
        // Determine status
        let status;
        let pdaBroken = false;
        
        if (oddsNumbers[0] === 0 && oddsNumbers[1] === 0 && oddsNumbers[2] === 0) {
          // Dead/broken PDA - odds should never be [0,0,0]
          status = 'dead_broken_pda';
          pdaBroken = true;
          deadBroken++;
          
          // Flag in DB
          await base44.asServiceRole.entities.Bet.update(bet.id, {
            pda_broken: true,
            solana_market_created: false,
          });
          
          console.log(`[auditMarkets] ☠️ ${bet.id}: DEAD/BROKEN - oracle_odds=[0,0,0]`);
        } else if (oddsNumbers[0] > 100) {
          // Live and good - odds look reasonable
          status = 'live_good';
          liveGood++;
          console.log(`[auditMarkets] ✓ ${bet.id}: LIVE GOOD - oracle_odds=[${oddsNumbers.join(',')}]`);
        } else {
          // Live but suspicious (odds too low)
          status = 'live_suspicious';
          liveBad++;
          console.log(`[auditMarkets] ⚠️ ${bet.id}: LIVE SUSPICIOUS - oracle_odds=[${oddsNumbers.join(',')}]`);
        }
        
        auditResults.push({
          bet_id: bet.id,
          match_id: bet.match_id,
          match_name: matchMap[bet.match_id] ? `${matchMap[bet.match_id].team_a} vs ${matchMap[bet.match_id].team_b}` : 'Unknown Match',
          market_pda: bet.solana_market_pda,
          status,
          oracle_odds: oddsNumbers,
          pda_broken: pdaBroken,
        });
        
      } catch (err) {
        console.error(`[auditMarkets] Error auditing ${bet.id}:`, err.message);
        auditResults.push({
          bet_id: bet.id,
          match_id: bet.match_id,
          match_name: matchMap[bet.match_id] ? `${matchMap[bet.match_id].team_a} vs ${matchMap[bet.match_id].team_b}` : 'Unknown Match',
          market_pda: bet.solana_market_pda,
          status: 'error',
          oracle_odds: null,
          pda_broken: false,
          error: err.message,
        });
        notFound++;
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Summary
    const summary = {
      total_bets: allBets.length,
      needs_deploy: needsDeploy,
      dead_broken_pda: deadBroken,
      live_good: liveGood,
      live_suspicious: liveBad,
      error: notFound,
    };
    
    console.log('[auditMarkets] Summary:', summary);
    
    return Response.json({
      success: true,
      summary,
      audit_results: auditResults,
    });
    
  } catch (error) {
    console.error('auditMarkets error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});