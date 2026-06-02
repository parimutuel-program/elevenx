import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Creates a pari-mutuel market on-chain for a bet entity.
 * No LP required - bettors bet directly against the pool.
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
    
    if (accountInfo) {
      const expectedMinSize = 210;
      if (accountInfo.data.length >= expectedMinSize) {
        console.log('Market already exists and is properly initialized at:', marketPda.toBase58());
        
        // Check if force recreate is requested
        const forceRecreate = payload.force_recreate === true;
        if (forceRecreate) {
          console.log('Force recreating market with updated odds...');
          // Continue to recreate instruction below
        } else {
          return Response.json({
            success: true,
            marketPda: marketPda.toBase58(),
            alreadyExists: true,
          });
        }
      }
    }

    // Prepare create_market instruction with new discriminator
    const discriminator = Buffer.from(sha256("global:create_market")).slice(0, 8);

    const openUntil = bet.open_until ? Math.floor(new Date(bet.open_until).getTime() / 1000) : Math.floor(Date.now() / 1000) + 86400;
    const settleAfter = openUntil + 3600;

    const outcomeNames = [
      Buffer.alloc(32),
      Buffer.alloc(32),
      Buffer.alloc(32),
    ];
    Buffer.from(bet.outcome_a || 'A').copy(outcomeNames[0], 0, 0, Math.min(bet.outcome_a?.length || 1, 32));
    Buffer.from(bet.outcome_b || 'B').copy(outcomeNames[1], 0, 0, Math.min(bet.outcome_b?.length || 1, 32));
    Buffer.from(bet.outcome_draw || 'Draw').copy(outcomeNames[2], 0, 0, Math.min(bet.outcome_draw?.length || 4, 32));

    // Build instruction data: discriminator + CreateMarketParams
    // CreateMarketParams size: 32 + 96 + 8 + 8 + 2 + 1 + 24 = 171 bytes
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
    
    // oracle_odds: [u64; 3] - 24 bytes (3 x 8 bytes)
    // Convert decimal odds to basis points (multiply by 100) before converting to BigInt
    const oddsA = BigInt(Math.round((bet.odds_a || bet.oracle_odds_a || 0) * 100));
    const oddsB = BigInt(Math.round((bet.odds_b || bet.oracle_odds_b || 0) * 100));
    const oddsDraw = BigInt(Math.round((bet.odds_draw || bet.oracle_odds_draw || 0) * 100));
    paramsData.writeBigUInt64LE(oddsA, offset);
    offset += 8;
    paramsData.writeBigUInt64LE(oddsB, offset);
    offset += 8;
    paramsData.writeBigUInt64LE(oddsDraw, offset);
    offset += 8;

    const instructionData = Buffer.concat([discriminator, paramsData]);

    console.log('Market PDA derived:', marketPda.toBase58());
    console.log('Instruction data length:', instructionData.length);

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
      initParams.writeUInt16LE(200, 0); // fee_percent: 2%
      initParams.writeUInt8(51, 2); // consensus_threshold: 51%
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
      forceRecreated: payload.force_recreate === true,
      solana_instruction: {
        instruction_type: 'create_market',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        instruction_data: instructionData.toString('base64'),
        accounts: {
          market: marketPda.toBase58(),
          payer: '',
          systemProgram: '11111111111111111111111111111111',
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        }
      },
      message: payload.force_recreate === true 
        ? 'Sign to RECREATE market with updated odds (this will overwrite existing market data)' 
        : 'Sign to create pari-mutuel market on-chain',
    });

  } catch (error) {
    console.error('createMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});