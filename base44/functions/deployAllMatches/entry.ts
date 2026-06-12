import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

function getSolanaConfig() {
  let rawUrl = Deno.env.get('SOLANA_RPC_URL') || '';
  
  // Handle malformed secret (e.g., "RPC_URL=..." or UUID)
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

  const openUntil = Math.floor(new Date(bet.open_until).getTime() / 1000);
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

  // Validate odds exist and are non-zero BEFORE scaling to basis points
  const rawOddsA = bet.odds_a || 0;
  const rawOddsB = bet.odds_b || 0;
  const rawOddsDraw = bet.odds_draw || 0;
  
  // CRITICAL: Skip bets with zero/null/invalid odds - prevents dead markets
  // Each odds value must be > 1.0 (decimal format from The Odds API)
  if (!rawOddsA || !rawOddsB || !rawOddsDraw || rawOddsA <= 0 || rawOddsB <= 0 || rawOddsDraw <= 0) {
    throw new Error(`Invalid odds for ${bet.title || bet.match_id}: A=${rawOddsA}, B=${rawOddsB}, Draw=${rawOddsDraw}. Run autoFetchOdds first.`);
  }
  
  // Convert decimal odds (e.g., 2.50) to basis points (250) where 100 = 1.0x
  // Each value MUST be > 100 (minimum 101 = 1.01x multiplier)
  const oddsA = Math.round(rawOddsA * 100);
  const oddsB = Math.round(rawOddsB * 100);
  const oddsDraw = Math.round(rawOddsDraw * 100);
  
  // Enforce minimum 101 (1.01x) to prevent invalid on-chain state
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
    const body = await req.clone().json().catch(() => ({}));
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

    console.log('[deployAllMatches] Starting deployment...');

    const batchOffset = body.batch_offset || 0; // which global index to start from
    const batchSize = body.batch_size || 12;    // how many to include in this batch
    const force = body.force === true;           // force redeploy all bets regardless of status

    const allBets = await base44.asServiceRole.entities.Bet.filter({});
    const allMatches = await base44.asServiceRole.entities.Match.filter({});
    const matchIds = new Set(allMatches.map(m => m.id));
    
    // Sort deterministically by id for stable batching
    allBets.sort((a, b) => a.id.localeCompare(b.id));

    // CRITICAL: Only deploy MISSING matches - skip the 37 already correctly deployed
    // A match is "deployed" if it has solana_market_pda set AND the on-chain market is bettable with correct teams
    const undeployed = allBets.filter(b => {
      if (!matchIds.has(b.match_id)) return false; // Skip orphans
      if (!b.solana_market_pda) return true; // No PDA = needs deployment
      // Has PDA but need to verify it's actually correct on-chain
      return false; // If PDA is set, assume deployed (will verify on-chain below)
    });

    // Apply batch window: batchOffset is an index into the undeployed list
    const betsToDeploy = undeployed.slice(batchOffset, batchOffset + batchSize);

    console.log(`[deployAllMatches] Batch offset=${batchOffset} size=${batchSize}: ${betsToDeploy.length} bets (total undeployed: ${undeployed.length})`);

    if (betsToDeploy.length === 0) {
      return Response.json({
        success: true,
        message: `✓ Batch complete! ${undeployed.length - batchOffset <= 0 ? 'All matches deployed' : `${undeployed.length} matches still pending`}`,
        total: allBets.length,
        deployed: allBets.length - undeployed.length,
      });
    }

    // Check platform is initialized
    const platformInfo = await connection.getAccountInfo(platformPda);
    if (!platformInfo) {
      return Response.json({ error: 'Platform not initialized on Solana. Go to Platform tab and click "Init Platform" first.' });
    }

    // Find first valid bet to deploy (skip orphans and already-deployed)
    let betToDeploy = null;
    let matchToDeploy = null;
    let remaining = betsToDeploy.length;
    let usedMatchId = null; // Track if we used match_id_v2
    
    for (const bet of betsToDeploy) {
      const matches = await base44.asServiceRole.entities.Match.filter({ id: bet.match_id });
      const match = matches[0];
      
      if (!match) {
        // Skip orphan bet
        await base44.asServiceRole.entities.Bet.update(bet.id, { solana_market_created: true });
        console.log(`[deployAllMatches] Skipping orphan bet ${bet.id} (no match)`);
        remaining--;
        continue;
      }
      
      // Check PDA status before deployment
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(bet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(bet.match_id.length, 32));
      const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
      const marketInfo = await connection.getAccountInfo(marketPda);
      
      // Check if PDA is occupied by dead/fake market
      let effectiveMatchId = bet.match_id;
      let pdaStatus = 'FREE';
      
      if (marketInfo && !force) {
        // Parse on-chain market to check status
        const data = marketInfo.data;
        // CONFIRMED byte offsets: odds[0] at 156, odds[1] at 164, odds[2] at 172
        const oracleOddsA = Number(data.readBigUInt64LE(156));
        const oracleOddsB = Number(data.readBigUInt64LE(164));
        const oracleOddsDraw = Number(data.readBigUInt64LE(172));
        
        // Parse team names from on-chain data
        const chainTeamA = new TextDecoder().decode(data.slice(40, 72)).replace(/\0/g, '').trim();
        const chainTeamB = new TextDecoder().decode(data.slice(72, 103)).replace(/\0/g, '').trim();
        const teamMismatch = chainTeamA !== match.team_a || chainTeamB !== match.team_b;
        const isDead = oracleOddsA === 0 && oracleOddsB === 0 && oracleOddsDraw === 0;
        const isBettable = oracleOddsA > 100 && oracleOddsB > 100 && oracleOddsDraw > 100;
        
        // Step 1c: Skip if already has correct bettable on-chain market (team names match + bettable odds)
        if (!teamMismatch && !isDead && isBettable) {
          await base44.asServiceRole.entities.Bet.update(bet.id, {
            solana_market_created: true,
            solana_market_pda: marketPda.toBase58(),
          });
          console.log(`[deployAllMatches] ✓ Already deployed with bettable market: ${bet.title} (odds: ${oracleOddsA/100}, ${oracleOddsB/100}, ${oracleOddsDraw/100})`);
          remaining--;
          continue;
        }
        
        if (isDead || teamMismatch) {
          // PDA is occupied by dead or fake market - use match_id_v2
          effectiveMatchId = bet.match_id + '_v2';
          pdaStatus = isDead ? 'OCCUPIED_DEAD' : 'OCCUPIED_FAKE';
          console.log(`[deployAllMatches] PDA ${pdaStatus} for ${bet.match_id}, using ${effectiveMatchId}`);
          
          // Update DB bet record to use new match_id
          await base44.asServiceRole.entities.Bet.update(bet.id, { match_id: effectiveMatchId });
        }
      }
      
      // Validate odds one more time before deployment
      if ((bet.odds_a <= 0 || bet.odds_b <= 0 || bet.odds_draw <= 0) && !force) {
        console.log(`[deployAllMatches] ☠️ Skipping bet ${bet.id} - DEAD ODDS: A=${bet.odds_a}, B=${bet.odds_b}, Draw=${bet.odds_draw}`);
        remaining--;
        continue;
      }
      
      // Found valid bet to deploy
      betToDeploy = bet;
      matchToDeploy = match;
      usedMatchId = effectiveMatchId;
      console.log(`[deployAllMatches] ✓ Found valid bet to deploy: ${bet.title || bet.match_id}, using match_id: ${effectiveMatchId}, odds: A=${bet.odds_a}, B=${bet.odds_b}, Draw=${bet.odds_draw}`);
      break;
    }
    
    if (!betToDeploy) {
      return Response.json({
        success: true,
        message: `✓ Batch complete! All matches in this batch already deployed or skipped.`,
        remaining: 0,
        needsSigning: false,
        autoContinue: true,
      });
    }
    
    // Build instruction with effective match_id (may be match_id_v2 if PDA was occupied)
    const builtInstruction = buildCreateMarketInstruction(betToDeploy, matchToDeploy, programIdStr, programId, platformPda, rpcUrl, usedMatchId);

    console.log(`[deployAllMatches] Ready to deploy: ${betToDeploy.title}, remaining: ${remaining - 1}`);

    return Response.json({
      success: true,
      message: `Sign to deploy ${betToDeploy.title || betToDeploy.match_id}. ${remaining - 1} remaining after this.`,
      remaining: remaining - 1,
      needsSigning: true,
      solana_instruction: builtInstruction.solana_instruction,
      bet_id: betToDeploy.id,
      market_pda: builtInstruction.marketPda,
      match_id_used: usedMatchId,
    });

  } catch (error) {
    console.error('deployAllMatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});