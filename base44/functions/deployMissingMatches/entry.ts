import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
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

function buildCreateMarketInstruction(bet, match, programIdStr, programId, platformPda, rpcUrl, effectiveMatchId) {
  const matchIdBytes = Buffer.alloc(32);
  const matchIdToUse = effectiveMatchId || match.id;
  Buffer.from(matchIdToUse, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(matchIdToUse.length, 32));

  const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
  const [voteTallyPda] = PublicKey.findProgramAddressSync([Buffer.from('vote_tally'), marketPda.toBuffer()], programId);
  const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);

  // Use bet.open_until if set, otherwise fallback to match.match_time - 5 minutes (betting closes 5 min before kickoff)
  const rawOpenUntil = bet.open_until
    ? new Date(bet.open_until).getTime()
    : new Date(match.match_time).getTime() - 5 * 60 * 1000;
  const openUntil = Math.floor(rawOpenUntil / 1000);
  const settleAfter = openUntil + 60;

  const outcomeNames = ['A', 'B', 'Draw'].map((fallback, i) => {
    const src = [bet.outcome_a, bet.outcome_b, bet.outcome_draw][i] || fallback;
    const buf = Buffer.alloc(32);
    Buffer.from(src, 'utf-8').copy(buf, 0, 0, Math.min(src.length, 32));
    return buf;
  });

  const feeRaw = Math.min(bet.fee_percent || 200, 200);
  const feeOptionBuf = Buffer.alloc(3);
  feeOptionBuf.writeUInt8(1, 0);
  feeOptionBuf.writeUInt16LE(feeRaw, 1);

  const rawOddsA = bet.odds_a || 0;
  const rawOddsB = bet.odds_b || 0;
  const rawOddsDraw = bet.odds_draw || 0;
  
  if (!rawOddsA || !rawOddsB || !rawOddsDraw || rawOddsA <= 0 || rawOddsB <= 0 || rawOddsDraw <= 0) {
    throw new Error(`Invalid odds for ${bet.title || bet.match_id}: A=${rawOddsA}, B=${rawOddsB}, Draw=${rawOddsDraw}`);
  }
  
  const oddsA = Math.round(rawOddsA * 100);
  const oddsB = Math.round(rawOddsB * 100);
  const oddsDraw = Math.round(rawOddsDraw * 100);
  
  if (oddsA < 101 || oddsB < 101 || oddsDraw < 101) {
    throw new Error(`Odds too low for ${bet.title || bet.match_id}: A=${oddsA}, B=${oddsB}, Draw=${oddsDraw}. Minimum is 101 (1.01x)`);
  }

  const paramsData = Buffer.alloc(172);
  let offset = 0;
  matchIdBytes.copy(paramsData, offset); offset += 32;
  outcomeNames[0].copy(paramsData, offset); offset += 32;
  outcomeNames[1].copy(paramsData, offset); offset += 32;
  outcomeNames[2].copy(paramsData, offset); offset += 32;
  paramsData.writeBigInt64LE(BigInt(openUntil), offset); offset += 8;
  paramsData.writeBigInt64LE(BigInt(settleAfter), offset); offset += 8;
  feeOptionBuf.copy(paramsData, offset); offset += 3;
  paramsData.writeUInt8(3, offset); offset += 1;
  paramsData.writeBigUInt64LE(BigInt(oddsA), offset); offset += 8;
  paramsData.writeBigUInt64LE(BigInt(oddsB), offset); offset += 8;
  paramsData.writeBigUInt64LE(BigInt(oddsDraw), offset); offset += 8;

  const discriminator = Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]);
  const instructionData = Buffer.concat([discriminator, paramsData]);

  const keys = [
    { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
    { pubkey: voteTallyPda.toBase58(), isSigner: false, isWritable: true },
    { pubkey: platformPda.toBase58(), isSigner: false, isWritable: true },
    { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
  ];

  const accounts = {
    market: marketPda.toBase58(),
    voteTally: voteTallyPda.toBase58(),
    platformConfig: platformPda.toBase58(),
    admin: 'SIGNER_WALLET',
    systemProgram: SystemProgram.programId.toBase58(),
  };
  
  return {
    marketPda: marketPda.toBase58(),
    feeVaultPda: feeVaultPda.toBase58(),
    solana_instruction: {
      instruction_type: 'create_market',
      programId: programIdStr,
      rpcUrl,
      keys,
      accounts,
      instruction_data: instructionData.toString('base64'),
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: Check platform user OR wallet JWT
    let walletAddress = null;
    
    // Try platform auth first
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') {
        // Platform admin - proceed
      } else {
        throw new Error('Not platform admin');
      }
    } catch (_) {
      // No platform auth - try wallet JWT
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      
      if (token && token.split('.').length === 3) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          walletAddress = payload.walletAddress;
        } catch (_) {}
      }
      
      if (!walletAddress) {
        return Response.json({ error: 'Authentication required' }, { status: 403 });
      }
    }
    
    // Verify admin status using service role
    if (walletAddress) {
      const walletUsers = await base44.asServiceRole.entities.WalletUser.filter({ wallet_address: walletAddress });
      if (!walletUsers[0] || walletUsers[0].role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    }

    const { rpcUrl, programIdStr, programId, connection } = getSolanaConfig();
    const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);

    // Check platform is initialized
    const platformInfo = await connection.getAccountInfo(platformPda);
    if (!platformInfo) {
      return Response.json({ error: 'Platform not initialized on Solana. Go to Platform tab and click "Init Platform" first.' });
    }

    // Fetch all bets and matches
    const allBets = await base44.asServiceRole.entities.Bet.filter({});
    const allMatches = await base44.asServiceRole.entities.Match.filter({});
    const matchMap = new Map(allMatches.map(m => [m.id, m]));
    
    // CRITICAL FIX: Scan ALL on-chain markets to find deployed teams (not just DB-derived PDAs)
    // This catches duplicates created with _v2 suffixes that have different PDA addresses
    const deployedTeams = new Set();
    const pdaCache = new Map();
    const onChainMarkets = []; // Store all valid on-chain markets
    
    console.log('[deployMissingMatches] Scanning ALL on-chain markets...');
    const allProgramAccounts = await connection.getProgramAccounts(programId, {
      filters: [{ dataSize: 312 }], // BetMarket account size
    });
    console.log(`[deployMissingMatches] Found ${allProgramAccounts.length} on-chain market accounts`);
    
    // Parse all on-chain markets to extract team names
    for (const account of allProgramAccounts) {
      const data = account.account.data;
      const chainTeamA = new TextDecoder().decode(data.slice(40, 72)).replace(/\0/g, '').trim();
      const chainTeamB = new TextDecoder().decode(data.slice(72, 103)).replace(/\0/g, '').trim();
      const oracleOddsA = Number(data.readBigUInt64LE(156));
      const oracleOddsB = Number(data.readBigUInt64LE(164));
      const oracleOddsDraw = Number(data.readBigUInt64LE(172));
      
      // Valid market: non-zero odds
      const isValid = oracleOddsA > 0 || oracleOddsB > 0 || oracleOddsDraw > 0;
      
      if (isValid && chainTeamA && chainTeamB) {
        const key = `${chainTeamA.toLowerCase().trim()}|${chainTeamB.toLowerCase().trim()}`;
        deployedTeams.add(key);
        onChainMarkets.push({
          pubkey: account.pubkey.toBase58(),
          teamA: chainTeamA,
          teamB: chainTeamB,
          key,
        });
        console.log(`[deployMissingMatches] ✓ On-chain: ${chainTeamA} vs ${chainTeamB} (${account.pubkey.toBase58().slice(0, 8)}...)`);
      }
    }
    
    // Also check DB-deployed flags (for matches not yet on-chain but marked in DB)
    for (const bet of allBets) {
      if (!matchMap.has(bet.match_id)) continue;
      
      const match = matchMap.get(bet.match_id);
      const key = `${match.team_a.toLowerCase().trim()}|${match.team_b.toLowerCase().trim()}`;
      
      if (bet.solana_market_created && bet.solana_market_pda && !deployedTeams.has(key)) {
        deployedTeams.add(key);
        console.log(`[deployMissingMatches] ✓ DB-deployed: ${match.team_a} vs ${match.team_b}`);
      }
    }
    
    // Find MISSING matches (not in deployed set)
    // CRITICAL: Also check on-chain to avoid creating duplicates
    const missingMatches = allMatches.filter(m => {
      const key = `${m.team_a.toLowerCase().trim()}|${m.team_b.toLowerCase().trim()}`;
      if (deployedTeams.has(key)) return false; // Already marked as deployed in DB
      
      // Check if there's ANY bet for this match with a PDA (even if solana_market_created=false)
      const matchBets = allBets.filter(b => b.match_id === m.id && b.solana_market_pda);
      if (matchBets.length > 0) {
        // There's a PDA in DB - verify it's actually valid on-chain before deploying
        return false; // Skip, let cleanup function handle invalid ones
      }
      
      return true;
    });
    
    console.log(`[deployMissingMatches] Found ${missingMatches.length} missing matches out of ${allMatches.length} total`);
    
    if (missingMatches.length === 0) {
      return Response.json({
        success: true,
        message: '✓ All matches deployed!',
        totalMissing: 0,
        needsSigning: false,
      });
    }
    
    // Find first missing match with valid odds
    let betToDeploy = null;
    let matchToDeploy = null;
    let effectiveMatchId = null;
    let pdaStatus = null;
    let skippedCount = 0;
    
    for (const match of missingMatches) {
      const bets = allBets.filter(b => b.match_id === match.id);
      if (bets.length === 0) continue;
      
      const bet = bets[0];
      
      // Validate odds
      if (bet.odds_a <= 0 || bet.odds_b <= 0 || bet.odds_draw <= 0) {
        console.log(`[deployMissingMatches] ☠️ Skipping ${match.team_a} vs ${match.team_b} - DEAD ODDS`);
        skippedCount++;
        continue;
      }
      
      // Skip if betting window has already closed
      const rawOpenUntil = bet.open_until
        ? new Date(bet.open_until).getTime()
        : new Date(match.match_time).getTime() - 5 * 60 * 1000;
      if (rawOpenUntil < Date.now()) {
        console.log(`[deployMissingMatches] ☠️ Skipping ${match.team_a} vs ${match.team_b} - BETTING CLOSED (${new Date(rawOpenUntil).toISOString()})`);
        skippedCount++;
        continue;
      }
      
      // Check PDA status - use cached result if available
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(match.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match.id.length, 32));
      const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
      
      let marketInfo = pdaCache.get(marketPda.toBase58());
      if (marketInfo === undefined) {
        marketInfo = await connection.getAccountInfo(marketPda);
        pdaCache.set(marketPda.toBase58(), marketInfo);
      }
      
      effectiveMatchId = match.id;
      pdaStatus = 'FREE';
      
      if (marketInfo) {
        const data = marketInfo.data;
        const oracleOddsA = Number(data.readBigUInt64LE(156));
        const oracleOddsB = Number(data.readBigUInt64LE(164));
        const oracleOddsDraw = Number(data.readBigUInt64LE(172));

        const isDead = oracleOddsA === 0 && oracleOddsB === 0 && oracleOddsDraw === 0;

        const chainTeamA = new TextDecoder().decode(data.slice(40, 72)).replace(/\0/g, '').trim();
        const chainTeamB = new TextDecoder().decode(data.slice(72, 103)).replace(/\0/g, '').trim();
        const teamMismatch = chainTeamA !== match.team_a || chainTeamB !== match.team_b;

        // CRITICAL FIX: Do NOT create _v2 suffix - skip dead/fake markets and let admin clean them up first
        // Creating _v2 generates duplicate PDAs without closing the old ones
        if (isDead) {
          pdaStatus = 'OCCUPIED_DEAD';
          console.log(`[deployMissingMatches] ☠️ SKIP ${match.team_a} vs ${match.team_b} - PDA dead (odds=[0,0,0]), admin must close first`);
          skippedCount++;
          continue; // Skip this match, try next
        }
        
        if (teamMismatch) {
          pdaStatus = 'OCCUPIED_FAKE';
          console.log(`[deployMissingMatches] ☠️ SKIP ${match.team_a} vs ${match.team_b} - PDA has fake teams (${chainTeamA} vs ${chainTeamB}), admin must close first`);
          skippedCount++;
          continue; // Skip this match, try next
        }
        
        // PDA exists and looks valid - should have been caught by deployedTeams check, but double-check
        pdaStatus = 'OCCUPIED_VALID';
        console.log(`[deployMissingMatches] ☠️ SKIP ${match.team_a} vs ${match.team_b} - PDA already valid`);
        skippedCount++;
        continue;
      }
      
      betToDeploy = bet;
      matchToDeploy = match;
      console.log(`[deployMissingMatches] ✓ Found missing match: ${match.team_a} vs ${match.team_b}, PDA status: ${pdaStatus}`);
      break;
    }
    
    if (!betToDeploy) {
      return Response.json({
        success: true,
        message: '✓ All missing matches processed!',
        totalMissing: missingMatches.length,
        skipped_count: skippedCount,
        needsSigning: false,
      });
    }
    
    // DEBUG: Log exact odds values being passed
    console.log('[deployMissingMatches] === ODDS DEBUG ===');
    console.log('[deployMissingMatches] Bet ID:', betToDeploy.id);
    console.log('[deployMissingMatches] Match:', matchToDeploy.team_a, 'vs', matchToDeploy.team_b);
    console.log('[deployMissingMatches] Raw odds from DB:', {
      odds_a: betToDeploy.odds_a,
      odds_b: betToDeploy.odds_b,
      odds_draw: betToDeploy.odds_draw,
    });
    console.log('[deployMissingMatches] Converted to basis points:', {
      odds_a_bps: Math.round(betToDeploy.odds_a * 100),
      odds_b_bps: Math.round(betToDeploy.odds_b * 100),
      odds_draw_bps: Math.round(betToDeploy.odds_draw * 100),
    });
    console.log('[deployMissingMatches] open_until:', betToDeploy.open_until);
    console.log('[deployMissingMatches] Current timestamp:', Math.floor(Date.now() / 1000));
    console.log('[deployMissingMatches] Time until close:', Math.floor(new Date(betToDeploy.open_until).getTime() / 1000) - Math.floor(Date.now() / 1000), 'seconds');
    console.log('[deployMissingMatches] ===================');
    
    const builtInstruction = buildCreateMarketInstruction(betToDeploy, matchToDeploy, programIdStr, programId, platformPda, rpcUrl, effectiveMatchId);
    
    return Response.json({
      success: true,
      message: `Sign to deploy ${matchToDeploy.team_a} vs ${matchToDeploy.team_b} (${pdaStatus}). ${missingMatches.length - 1} remaining.`,
      totalMissing: missingMatches.length,
      remaining: missingMatches.length - 1,
      skipped_count: skippedCount,
      needsSigning: true,
      solana_instruction: builtInstruction.solana_instruction,
      bet_id: betToDeploy.id,
      market_pda: builtInstruction.marketPda,
      match_id_to_update: effectiveMatchId, // Only update DB if tx succeeds
      original_match_id: matchToDeploy.id,
      pda_status: pdaStatus,
    });

  } catch (error) {
    console.error('deployMissingMatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});