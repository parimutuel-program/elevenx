import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

function getSolanaConfig() {
  let rawUrl = Deno.env.get('SOLANA_RPC_URL') || '';
  if (rawUrl.includes('RPC_URL=')) rawUrl = rawUrl.split('RPC_URL=')[1].trim();
  if (!rawUrl.startsWith('http') || rawUrl.includes('uuid')) rawUrl = 'https://api.mainnet-beta.solana.com';
  const programIdStr = Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';
  return { 
    rpcUrl: rawUrl, 
    programIdStr, 
    programId: new PublicKey(programIdStr), 
    connection: new Connection(rawUrl, 'confirmed') 
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const payload = await req.clone().json().catch(() => ({}));
    const { futures_market_id } = payload;

    if (!futures_market_id) return Response.json({ error: 'Missing futures_market_id' }, { status: 400 });

    const futuresMarkets = await base44.entities.FuturesMarket.filter({ id: futures_market_id });
    const futuresMarket = futuresMarkets[0];
    if (!futuresMarket) return Response.json({ error: 'Futures market not found' }, { status: 404 });
    if (!futuresMarket.outcomes || futuresMarket.outcomes.length < 3) return Response.json({ error: 'Futures market must have exactly 3 outcomes' }, { status: 400 });

    const { programId, programIdStr, connection } = getSolanaConfig();
    
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(futures_market_id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(futures_market_id.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketIdBytes], programId);
    const [voteTallyPda] = PublicKey.findProgramAddressSync([Buffer.from('vote_tally'), marketPda.toBuffer()], programId);

    const accountInfo = await connection.getAccountInfo(marketPda);
    if (accountInfo && accountInfo.data.length >= 210) {
      return Response.json({ success: true, marketPda: marketPda.toBase58(), alreadyExists: true });
    }

    const isTestMarket = futuresMarket.title?.toLowerCase().includes('test');
    const WORLD_CUP_FINAL_KICKOFF = new Date('2026-07-19T13:00:00-06:00');
    const WORLD_CUP_FINAL_ENDS = new Date('2026-07-19T15:00:00-06:00');
    
    let openUntil, settleAfter;
    if (isTestMarket) {
      openUntil = Math.floor(new Date(futuresMarket.open_until).getTime() / 1000);
      settleAfter = openUntil + 60;
    } else if (futuresMarket.category === 'tournament') {
      openUntil = Math.floor(WORLD_CUP_FINAL_KICKOFF.getTime() / 1000);
      settleAfter = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);
    } else if (futuresMarket.category === 'player') {
      openUntil = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);
      settleAfter = openUntil + 7200;
    } else {
      openUntil = Math.floor(Date.now() / 1000) + 86400;
      settleAfter = openUntil + 7200;
    }

    const discriminator = Buffer.from([103, 226, 97, 235, 200, 188, 251, 254]);
    const outcomeNames = [Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32)];
    for (let i = 0; i < 3; i++) {
      const label = futuresMarket.outcomes?.[i]?.label || `Outcome ${i + 1}`;
      Buffer.from(label, 'utf-8').copy(outcomeNames[i], 0, 0, Math.min(label.length, 32));
    }

    const feeOptionBuf = Buffer.alloc(3);
    feeOptionBuf.writeUInt8(1, 0);
    feeOptionBuf.writeUInt16LE(0, 1);
    const oddsArr = [0, 1, 2].map(i => Math.max(Math.round((futuresMarket.outcomes?.[i]?.odds || 2.0) * 100), 101));

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
    const [platformConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
    const platformConfigInfo = await connection.getAccountInfo(platformConfigPda);
    
    if (!platformConfigInfo) {
      const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);
      const initDiscriminator = Buffer.from(sha256("global:initialize_platform")).slice(0, 8);
      const initParams = Buffer.alloc(3);
      initParams.writeUInt16LE(0, 0);
      initParams.writeUInt8(51, 2);
      return Response.json({
        success: false,
        error: 'Platform config not initialized',
        needsPlatformInit: true,
        solana_instruction: {
          instruction_type: 'initialize_platform',
          programId: programIdStr,
          instruction_data: Buffer.concat([initDiscriminator, initParams]).toString('base64'),
          accounts: { platformConfig: platformConfigPda.toBase58(), feeVault: feeVaultPda.toBase58(), admin: '' }
        }
      });
    }

    await serviceRole.entities.FuturesMarket.update(futures_market_id, { solana_market_pda: marketPda.toBase58() });

    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      alreadyExists: false,
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
      futures_market_id: futures_market_id,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});