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

function buildCreateMarketInstruction(bet, match, programIdStr, programId, platformPda, rpcUrl) {
  const matchIdBytes = Buffer.alloc(32);
  Buffer.from(match.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match.id.length, 32));

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

  // Validate odds are non-zero BEFORE scaling to basis points
  const rawOddsA = bet.odds_a || 0;
  const rawOddsB = bet.odds_b || 0;
  const rawOddsDraw = bet.odds_draw || 0;
  
  // CRITICAL: Reject bets with zero/invalid odds - prevents dead markets
  if (rawOddsA <= 0 || rawOddsB <= 0 || rawOddsDraw <= 0) {
    throw new Error(`Invalid odds for ${bet.title || bet.match_id}: A=${rawOddsA}, B=${rawOddsB}, Draw=${rawOddsDraw}. Update with live odds first.`);
  }
  
  // Scale decimal odds (e.g., 2.50) to basis points (250) where 100 = 1.0x
  const oddsA = Math.max(Math.round(rawOddsA * 100), 101);
  const oddsB = Math.max(Math.round(rawOddsB * 100), 101);
  const oddsDraw = Math.max(Math.round(rawOddsDraw * 100), 101);

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

    // Support both platform auth and wallet-based auth
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

    // In force mode, include all bets; otherwise only undeployed
    // Also filter out orphan bets (no matching match entity)
    const undeployed = (force ? allBets : allBets.filter(b => !b.solana_market_created || !b.solana_market_pda))
      .filter(b => matchIds.has(b.match_id));

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
      
      // Check if already deployed on-chain
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(bet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(bet.match_id.length, 32));
      const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
      const marketInfo = await connection.getAccountInfo(marketPda);
      
      if (marketInfo && !force) {
        await base44.asServiceRole.entities.Bet.update(bet.id, {
          solana_market_created: true,
          solana_market_pda: marketPda.toBase58(),
        });
        console.log(`[deployAllMatches] ✓ Already deployed: ${bet.title}`);
        remaining--;
        continue;
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
      console.log(`[deployAllMatches] ✓ Found valid bet to deploy: ${bet.title || bet.match_id}, odds: A=${bet.odds_a}, B=${bet.odds_b}, Draw=${bet.odds_draw}`);
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
    
    const builtInstruction = buildCreateMarketInstruction(betToDeploy, matchToDeploy, programIdStr, programId, platformPda, rpcUrl);

    console.log(`[deployAllMatches] Ready to deploy: ${betToDeploy.title}, remaining: ${remaining - 1}`);

    return Response.json({
      success: true,
      message: `Sign to deploy ${betToDeploy.title || betToDeploy.match_id}. ${remaining - 1} remaining after this.`,
      remaining: remaining - 1,
      needsSigning: true,
      solana_instruction: builtInstruction.solana_instruction,
      bet_id: betToDeploy.id,
      market_pda: builtInstruction.marketPda,
    });

  } catch (error) {
    console.error('deployAllMatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});