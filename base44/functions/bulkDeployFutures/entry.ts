import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

/**
 * Bulk deploy all futures markets to Solana in a single transaction batch.
 * Returns array of instructions for client-side signing.
 */

/**
 * Deploy ALL futures markets to Solana in a single transaction.
 * Creates instructions for initializing all markets at once.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Admin wallet check ONLY - no platform auth dependency
    const ADMIN_WALLET = '4xfwNAkxNbgZuR5LsjTh91z9Sw3d9AVvHvbPpTaiipZZ';
    
    console.log('[bulkDeployFutures] ALL HEADERS:', Array.from(req.headers.entries()).map(([k, v]) => `${k}: ${v.slice?.(0, 50) || v}`).join(', '));
    
    // Try multiple auth sources (platform might strip Authorization header)
    const authHeader = req.headers.get('Authorization') || '';
    const xWalletToken = req.headers.get('X-Wallet-Token') || '';
    
    // Extract token from header (Bearer format)
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    } else if (xWalletToken) {
      token = xWalletToken;
    }
    
    // Also try body fallback
    let bodyToken = null;
    try {
      const body = await req.json();
      bodyToken = body._auth_token;
      console.log('[bulkDeployFutures] Token from body:', bodyToken ? 'found (' + bodyToken.length + ' chars)' : 'none');
    } catch (e) {
      console.log('[bulkDeployFutures] Could not read body:', e.message);
    }
    
    // Use header token first, fall back to body token
    if (!token && bodyToken) {
      token = bodyToken;
      console.log('[bulkDeployFutures] Using token from body');
    }
    
    if (!token || token.split('.').length !== 3) {
      console.error('[bulkDeployFutures] No valid JWT token. Header:', !!authHeader, 'X-Wallet-Token:', !!xWalletToken, 'Body:', !!bodyToken);
      return Response.json({ error: 'Admin only - no auth token', debug: { hasAuthHeader: !!authHeader, hasXWalletToken: !!xWalletToken, hasBodyToken: !!bodyToken } }, { status: 403 });
    }
    
    // Decode JWT payload
    let jwtPayload;
    try {
      jwtPayload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
      console.error('[bulkDeployFutures] Failed to decode JWT:', e.message);
      return Response.json({ error: 'Invalid token' }, { status: 403 });
    }
    
    console.log('[bulkDeployFutures] JWT payload:', {
      walletAddress: jwtPayload.walletAddress?.slice(0, 8),
      role: jwtPayload.role,
    });
    
    // Check if admin wallet OR admin role
    if (jwtPayload.walletAddress !== ADMIN_WALLET && jwtPayload.role !== 'admin') {
      console.error('[bulkDeployFutures] Access denied - wallet:', jwtPayload.walletAddress?.slice(0, 8), 'role:', jwtPayload.role);
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }
    
    console.log('[bulkDeployFutures] ✓ Authenticated as admin');

    // Get all futures markets that are not yet deployed (open OR coming_soon)
    const allMarkets = await serviceRole.entities.FuturesMarket.filter({});
    const marketsToDeploy = allMarkets.filter(m => !m.solana_market_created && (m.status === 'open' || m.status === 'coming_soon'));

    if (marketsToDeploy.length === 0) {
      return Response.json({ 
        error: 'No markets to deploy. All markets are already deployed or closed.',
        alreadyDeployed: allMarkets.filter(m => m.solana_market_created).length,
      }, { status: 400 });
    }

    console.log(`[bulkDeployFutures] Deploying ${marketsToDeploy.length} markets to Solana`);

    // Get program ID - use ELEVENX_PROGRAM_ID which is the deployed program
    const PROGRAM_ID = Deno.env.get('ELEVENX_PROGRAM_ID');
    if (!PROGRAM_ID) {
      return Response.json({ error: 'ELEVENX_PROGRAM_ID not configured' }, { status: 500 });
    }

    const programId = new PublicKey(PROGRAM_ID);
    console.log('[bulkDeployFutures] Using program ID:', PROGRAM_ID);

    // Derive platform config PDA (seed must match createFuturesMarketOnChain: 'platform')
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Build instructions for all markets
    const instructions = [];
    const marketUpdates = [];

    for (const market of marketsToDeploy) {
      // Validate market has exactly 3 outcomes
      if (!market.outcomes || market.outcomes.length !== 3) {
        console.error(`[bulkDeployFutures] Market ${market.id} has invalid outcomes:`, market.outcomes);
        continue;
      }

      // Derive market PDA
      const marketIdBytes = Buffer.alloc(32);
      Buffer.from(market.id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(market.id.length, 32));
      
      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), marketIdBytes],
        programId
      );

      // Derive vote tally PDA — seed is the market PDA's buffer (matches createFuturesMarketOnChain)
      const [voteTallyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vote_tally'), marketPda.toBuffer()],
        programId
      );

      // Calculate timestamps — World Cup Final: July 19, 2026 13:00 Costa Rica (UTC-6) = 19:00 UTC
      const WORLD_CUP_FINAL_KICKOFF = new Date('2026-07-19T13:00:00-06:00');
      const WORLD_CUP_FINAL_ENDS = new Date('2026-07-19T15:00:00-06:00');
      const openUntil = Math.floor(WORLD_CUP_FINAL_KICKOFF.getTime() / 1000);
      const settleAfter = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);

      // Build proper Anchor binary instruction data (matches createFuturesMarketOnChain exactly)
      const discriminator = Buffer.from(sha256('global:create_market')).slice(0, 8);

      const outcomeNames = [Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32)];
      for (let i = 0; i < 3; i++) {
        const label = market.outcomes[i]?.label || `Outcome ${i + 1}`;
        Buffer.from(label).copy(outcomeNames[i], 0, 0, Math.min(label.length, 32));
      }

      // params: match_id(32) + outcome_names(32*3) + open_until(8) + settle_after(8) + fee_percent(2) + outcome_count(1) + oracle_odds(8*3) = 179 bytes
      const paramsData = Buffer.alloc(32 + (32 * 3) + 8 + 8 + 2 + 1 + (8 * 3));
      let offset = 0;

      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(market.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(market.id.length, 32));
      matchIdBytes.copy(paramsData, offset); offset += 32;

      outcomeNames.forEach(name => { name.copy(paramsData, offset); offset += 32; });

      paramsData.writeBigInt64LE(BigInt(openUntil), offset); offset += 8;
      paramsData.writeBigInt64LE(BigInt(settleAfter), offset); offset += 8;
      paramsData.writeUInt16LE(0, offset); offset += 2;
      paramsData.writeUInt8(3, offset); offset += 1;

      for (let i = 0; i < 3; i++) {
        const oddsBps = BigInt(Math.round((market.outcomes[i]?.odds || 1) * 100));
        paramsData.writeBigUInt64LE(oddsBps, offset); offset += 8;
      }

      const instructionDataBase64 = Buffer.concat([discriminator, paramsData]).toString('base64');

      console.log(`[bulkDeployFutures] Prepared market ${market.country} (${market.id})`);

      instructions.push({
        instruction_type: 'create_market',
        programId: PROGRAM_ID,
        accounts: {
          market: marketPda.toBase58(),
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        },
        instruction_data: instructionDataBase64,
        marketId: market.id,
        marketPda: marketPda.toBase58(),
      });

      marketUpdates.push({
        id: market.id,
        solana_market_pda: marketPda.toBase58(),
      });
    }

    if (instructions.length === 0) {
      return Response.json({ error: 'Failed to prepare any market instructions' }, { status: 500 });
    }

    console.log(`[bulkDeployFutures] Total instructions: ${instructions.length}`);

    return Response.json({
      success: true,
      instructions,
      marketUpdates,
      marketCount: instructions.length,
      message: `Ready to deploy ${instructions.length} futures markets to Solana`,
    });

  } catch (error) {
    console.error('bulkDeployFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});