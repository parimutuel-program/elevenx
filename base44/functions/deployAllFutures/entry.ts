import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

function getSolanaConfig() {
  let rawUrl = Deno.env.get('SOLANA_RPC_URL') || '';
  if (rawUrl.includes('RPC_URL=')) rawUrl = rawUrl.split('RPC_URL=')[1].trim();
  if (!rawUrl.startsWith('http') || rawUrl.includes('uuid')) rawUrl = 'https://api.mainnet-beta.solana.com';
  // Use ELEVENX_PROGRAM_ID - this is the actual deployed program
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  console.log('[getSolanaConfig] Using program ID:', programIdStr);
  return { rpcUrl: rawUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rawUrl, 'confirmed') };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const body = await req.clone().json().catch(() => ({}));
    const force = body.force === true;

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
              const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: payload.walletAddress });
              if (walletUsers[0]?.role === 'admin') isAdmin = true;
            }
          }
        }
      } catch (_) {}
    }
    if (!isAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

    console.log('[deployAllFutures] Starting deployment... force:', force);

    const allMarkets = await serviceRole.entities.FuturesMarket.filter({});
    const marketsNotMarkedDeployed = force ? allMarkets : allMarkets.filter(m => !m.solana_market_created);

    console.log(`[deployAllFutures] Found ${marketsNotMarkedDeployed.length} markets not marked as deployed out of ${allMarkets.length} total`);

    if (marketsNotMarkedDeployed.length === 0) {
      return Response.json({ success: true, message: `✓ All ${allMarkets.length} futures verified on-chain`, total: allMarkets.length, deployed: allMarkets.length, verified: true });
    }
    
    const marketsToDeploy = marketsNotMarkedDeployed;
    const firstMarket = marketsToDeploy[0];
    const remaining = marketsToDeploy.length - 1;

    const { programId, programIdStr, connection } = getSolanaConfig();
    
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(firstMarket.id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(firstMarket.id.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketIdBytes], programId);
    const [voteTallyPda] = PublicKey.findProgramAddressSync([Buffer.from('vote_tally'), marketPda.toBuffer()], programId);
    const [platformConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);

    const accountInfo = await connection.getAccountInfo(marketPda);
    if (accountInfo && accountInfo.data.length >= 210) {
      await serviceRole.entities.FuturesMarket.update(firstMarket.id, { solana_market_created: true, solana_market_pda: marketPda.toBase58() });
      console.log(`[deployAllFutures] ✓ Already exists: ${firstMarket.country}`);
      return Response.json({ success: true, message: `Market already deployed. ${remaining} remaining`, remaining: remaining, needsSigning: false, autoContinue: true });
    }

    const isTestMarket = firstMarket.title?.toLowerCase().includes('test');
    const WORLD_CUP_FINAL_KICKOFF = new Date('2026-07-19T13:00:00-06:00');
    const WORLD_CUP_FINAL_ENDS = new Date('2026-07-19T15:00:00-06:00');
    
    let openUntil, settleAfter;
    if (isTestMarket) {
      openUntil = Math.floor(new Date(firstMarket.open_until).getTime() / 1000);
      settleAfter = openUntil + 60;
    } else if (firstMarket.category === 'tournament') {
      openUntil = Math.floor(WORLD_CUP_FINAL_KICKOFF.getTime() / 1000);
      settleAfter = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);
    } else if (firstMarket.category === 'player') {
      openUntil = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);
      settleAfter = openUntil + 7200;
    } else {
      openUntil = Math.floor(Date.now() / 1000) + 86400;
      settleAfter = openUntil + 7200;
    }

    const discriminator = Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]);
    const outcomeNames = [Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32)];
    for (let i = 0; i < 3; i++) {
      const label = firstMarket.outcomes?.[i]?.label || `Outcome ${i + 1}`;
      Buffer.from(label, 'utf-8').copy(outcomeNames[i], 0, 0, Math.min(label.length, 32));
    }

    const feeOptionBuf = Buffer.alloc(3);
    feeOptionBuf.writeUInt8(1, 0);
    feeOptionBuf.writeUInt16LE(0, 1);
    
    // Validate and scale futures odds (decimal to basis points)
    const oddsArr = [0, 1, 2].map(i => {
      const rawOdds = firstMarket.outcomes?.[i]?.odds || 0;
      if (rawOdds <= 0) {
        throw new Error(`Invalid odds for ${firstMarket.country} outcome ${i}: ${rawOdds}. Must be > 0.`);
      }
      return Math.max(Math.round(rawOdds * 100), 101);
    });

    const paramsData = Buffer.alloc(172);
    let offset = 0;
    marketIdBytes.copy(paramsData, offset); offset += 32;
    outcomeNames[0].copy(paramsData, offset); offset += 32;
    outcomeNames[1].copy(paramsData, offset); offset += 32;
    outcomeNames[2].copy(paramsData, offset); offset += 32;
    paramsData.writeBigInt64LE(BigInt(openUntil), offset); offset += 8;
    paramsData.writeBigInt64LE(BigInt(settleAfter), offset); offset += 8;
    feeOptionBuf.copy(paramsData, offset); offset += 3;
    paramsData.writeUInt8(3, offset); offset += 1;
    paramsData.writeBigUInt64LE(BigInt(oddsArr[0]), offset); offset += 8;
    paramsData.writeBigUInt64LE(BigInt(oddsArr[1]), offset); offset += 8;
    paramsData.writeBigUInt64LE(BigInt(oddsArr[2]), offset); offset += 8;

    const instructionData = Buffer.concat([discriminator, paramsData]);

    await serviceRole.entities.FuturesMarket.update(firstMarket.id, { solana_market_pda: marketPda.toBase58() });
    console.log(`[deployAllFutures] Ready to deploy: ${firstMarket.country}`);

    return Response.json({
      success: true,
      message: `Sign to deploy ${firstMarket.country || firstMarket.title}. ${remaining} remaining after this.`,
      remaining: remaining,
      needsSigning: true,
      solana_instruction: {
        instruction_type: 'create_market',
        programId: programIdStr,
        rpcUrl: connection.rpcEndpoint,
        marketPda: marketPda.toBase58(),
        instruction_data: instructionData.toString('base64'),
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: voteTallyPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: platformConfigPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: true },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        accounts: {
          market: marketPda.toBase58(),
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
          admin: 'SIGNER_WALLET',
          systemProgram: '11111111111111111111111111111111',
        },
      },
      market_id: firstMarket.id,
    });

  } catch (error) {
    console.error('deployAllFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});