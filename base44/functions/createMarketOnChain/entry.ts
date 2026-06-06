import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';
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

    // Skip on-chain check to avoid rate limits - just create the instruction
    // Frontend will handle the transaction and we'll check on-chain status after
    console.log('Preparing create_market instruction for:', marketPda.toBase58());

    // Prepare create_market instruction with new discriminator
    const discriminator = Buffer.from(sha256("global:create_market")).slice(0, 8);

    // CRITICAL: Check if this is a TEST market (title contains "Test" or "Quick Test")
    // Test markets should use their DB timeline exactly, no World Cup overrides
    const isTestMarket = bet.title?.toLowerCase().includes('test') || 
                         bet.outcome_a?.toLowerCase().includes('test');
    
    // Use the ACTUAL bet.open_until from database
    const bettingCloseTime = new Date(bet.open_until).getTime();
    const openUntil = Math.floor(bettingCloseTime / 1000);
    
    // For test markets: settle 1 second after betting closes (minimum required by Solana program)
    // For production markets: 5 minutes after betting closes
    const settleAfter = isTestMarket ? openUntil + 1 : openUntil + 300;
    
    if (isTestMarket) {
      console.log('[createMarketOnChain] TEST market detected - using DB timeline:', {
        openUntil: new Date(openUntil * 1000).toISOString(),
        settleAfter: new Date(settleAfter * 1000).toISOString(),
      });
    }

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

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Prepare platform init instruction (only used if platform not initialized)
    const initDiscriminator = Buffer.from(sha256("global:initialize_platform")).slice(0, 8);
    const initParams = Buffer.alloc(3);
    initParams.writeUInt16LE(200, 0); // fee_percent: 2%
    initParams.writeUInt8(51, 2); // consensus_threshold: 51%
    const initInstructionData = Buffer.concat([initDiscriminator, initParams]);

    // Check if platform is already initialized by checking if account exists
    const connection = new Connection(SOLANA_RPC_URL);
    let platformInitialized = false;
    try {
      const accountInfo = await connection.getAccountInfo(platformConfigPda);
      platformInitialized = accountInfo !== null;
      console.log('Platform initialized:', platformInitialized);
    } catch (err) {
      console.error('Failed to check platform status:', err.message);
      platformInitialized = false;
    }
    
    // Check if market exists on-chain (only if DB says it's created or force_recreate)
    let marketExistsOnChain = false;
    if (bet.solana_market_created || payload.force_recreate) {
      try {
        const marketInfo = await connection.getAccountInfo(marketPda);
        marketExistsOnChain = marketInfo !== null && marketInfo.data.length > 100;
        console.log('Market on-chain check:', { exists: marketExistsOnChain, hasData: marketInfo?.data.length });
      } catch (err) {
        console.error('Failed to check market status:', err.message);
      }
    }
    
    // Build create market instruction
    const createMarketInstruction = {
      instruction_type: 'create_market',
      programId: SOLANA_PROGRAM_ID,
      marketPda: marketPda.toBase58(),
      instruction_data: instructionData.toString('base64'),
      accounts: {
        market: marketPda.toBase58(),
        voteTally: voteTallyPda.toBase58(),
        platformConfig: platformConfigPda.toBase58(),
        admin: 'SIGNER_WALLET',
      }
    };
    
    // If DB says created but market doesn't exist on-chain, force recreate
    const shouldForceRecreate = (bet.solana_market_created && !marketExistsOnChain) || payload.force_recreate;

    // Only return platform init if NOT already initialized
    // Return createMarketInstruction in solana_instruction field for frontend to sign
    const response = {
      success: true,
      marketPda: marketPda.toBase58(),
      alreadyExists: marketExistsOnChain && !shouldForceRecreate,
      forceRecreated: shouldForceRecreate,
      needsPlatformInit: !platformInitialized,
      platformConfigPda: platformConfigPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      solana_instruction: platformInitialized ? createMarketInstruction : {
        instruction_type: 'initialize_platform',
        programId: SOLANA_PROGRAM_ID,
        instruction_data: initInstructionData.toString('base64'),
        accounts: {
          platformConfig: platformConfigPda.toBase58(),
          feeVault: feeVaultPda.toBase58(),
          admin: 'SIGNER_WALLET', // Use placeholder - frontend will replace with actual wallet
        }
      },
      message: shouldForceRecreate ? 'Recreating market (DB says created but on-chain missing)' : (platformInitialized ? 'Sign transaction to create market' : 'Initialize platform first, then create market'),
      bet_id: bet.id,
    };
    
    return Response.json(response);

  } catch (error) {
    console.error('createMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});