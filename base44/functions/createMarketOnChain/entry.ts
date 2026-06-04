import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Creates a pari-mutuel market on-chain for a bet entity.
 * Betting window: 5 minutes from now. Settlement enabled immediately after.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const payload = await req.json();
    const { bet_id, match_id } = payload;

    if (!bet_id || !match_id) {
      return Response.json({ error: 'Missing bet_id or match_id' }, { status: 400 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await base44.entities.Match.filter({ id: match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (accountInfo && accountInfo.data.length >= 249) {
      console.log('Market already exists at:', marketPda.toBase58());
      return Response.json({
        success: true,
        marketPda: marketPda.toBase58(),
        alreadyExists: true,
      });
    }

    // Set timestamps: open_until = now + 5 minutes, settle_after = open_until + 1 minute
    // This allows smooth testing - betting window closes in 5 minutes, settlement enabled immediately
    const now = Math.floor(Date.now() / 1000);
    const openUntil = now + 300;  // 5 minutes from now
    const settleAfter = openUntil + 60; // 1 minute after betting closes

    console.log('[createMarketOnChain] Timestamps:', {
      now: new Date(now * 1000).toISOString(),
      open_until: new Date(openUntil * 1000).toISOString(),
      settle_after: new Date(settleAfter * 1000).toISOString(),
    });

    // Prepare create_market instruction with Anchor discriminator
    const discriminator = Buffer.from(sha256("global:create_market")).slice(0, 8);

    const outcomeNames = [
      Buffer.alloc(32),
      Buffer.alloc(32),
      Buffer.alloc(32),
    ];
    Buffer.from(bet.outcome_a || 'A').copy(outcomeNames[0], 0, 0, Math.min(bet.outcome_a?.length || 1, 32));
    Buffer.from(bet.outcome_b || 'B').copy(outcomeNames[1], 0, 0, Math.min(bet.outcome_b?.length || 1, 32));
    Buffer.from(bet.outcome_draw || 'Draw').copy(outcomeNames[2], 0, 0, Math.min(bet.outcome_draw?.length || 4, 32));

    // Build instruction data: discriminator + CreateMarketParams (171 bytes)
    const paramsData = Buffer.alloc(171);
    let offset = 0;
    
    matchIdBytes.copy(paramsData, offset);
    offset += 32;
    
    outcomeNames[0].copy(paramsData, offset);
    offset += 32;
    outcomeNames[1].copy(paramsData, offset);
    offset += 32;
    outcomeNames[2].copy(paramsData, offset);
    offset += 32;
    
    paramsData.writeBigInt64LE(BigInt(openUntil), offset);
    offset += 8;
    
    paramsData.writeBigInt64LE(BigInt(settleAfter), offset);
    offset += 8;
    
    paramsData.writeUInt16LE(bet.fee_percent || 200, offset);
    offset += 2;
    
    paramsData.writeUInt8(3, offset); // outcome_count
    offset += 1;
    
    // oracle_odds: [u64; 3] - convert decimal odds to basis points (×100)
    const oddsA = BigInt(Math.round((bet.odds_a || 0) * 100));
    const oddsB = BigInt(Math.round((bet.odds_b || 0) * 100));
    const oddsDraw = BigInt(Math.round((bet.odds_draw || 0) * 100));
    paramsData.writeBigUInt64LE(oddsA, offset);
    offset += 8;
    paramsData.writeBigUInt64LE(oddsB, offset);
    offset += 8;
    paramsData.writeBigUInt64LE(oddsDraw, offset);
    offset += 8;

    const instructionData = Buffer.concat([discriminator, paramsData]);

    const [voteTallyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vote_tally'), marketPda.toBuffer()],
      programId
    );

    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const platformConfigInfo = await connection.getAccountInfo(platformConfigPda);
    if (!platformConfigInfo) {
      const [feeVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('fee_vault')],
        programId
      );
      
      const initDiscriminator = Buffer.from(sha256("global:initialize_platform")).slice(0, 8);
      const initParams = Buffer.alloc(3);
      initParams.writeUInt16LE(200, 0);
      initParams.writeUInt8(51, 2);
      const initInstructionData = Buffer.concat([initDiscriminator, initParams]);
      
      return Response.json({
        success: false,
        error: 'Platform config not initialized',
        needsPlatformInit: true,
        platformConfigPda: platformConfigPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
        message: 'Platform config must be initialized first by admin',
        solana_instruction: {
          instruction_type: 'initialize_platform',
          programId: SOLANA_PROGRAM_ID,
          instruction_data: initInstructionData.toString('base64'),
          accounts: {
            platformConfig: platformConfigPda.toBase58(),
            feeVault: feeVaultPda.toBase58(),
            admin: '',
          }
        }
      });
    }

    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      alreadyExists: false,
      solana_instruction: {
        instruction_type: 'create_market',
        programId: SOLANA_PROGRAM_ID,
        instruction_data: instructionData.toString('base64'),
        accounts: {
          market: marketPda.toBase58(),
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
          admin: 'SIGNER_WALLET', // Uses whoever's wallet is connected (admin)
        }
      },
      message: 'Sign to create market (betting closes in 5 minutes, settlement enabled immediately)',
      bet_id: bet.id,
    });

  } catch (error) {
    console.error('[createMarketOnChain] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});