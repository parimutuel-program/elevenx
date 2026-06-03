import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Creates a futures market on-chain for tournament-wide bets (World Cup Winner, Golden Boot, etc.)
 * Uses the same market structure but with tournament-specific timestamps.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const payload = await req.json();
    const { futures_market_id } = payload;

    if (!futures_market_id) {
      return Response.json({ error: 'Missing futures_market_id' }, { status: 400 });
    }

    // Fetch futures market from database
    const futuresMarkets = await base44.entities.FuturesMarket.filter({ id: futures_market_id });
    const futuresMarket = futuresMarkets[0];
    if (!futures) return Response.json({ error: 'Futures market not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive PDA for futures market using market ID as seed
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(futures_market_id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(futures_market_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('futures_market'), marketIdBytes],
      programId
    );

    // Derive vote tally PDA for this market
    const [voteTallyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vote_tally'), marketIdBytes],
      programId
    );

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (accountInfo) {
      const expectedMinSize = 210;
      if (accountInfo.data.length >= expectedMinSize) {
        console.log('Futures market already exists at:', marketPda.toBase58());
        return Response.json({
          success: true,
          marketPda: marketPda.toBase58(),
          alreadyExists: true,
        });
      }
    }

    // Calculate timestamps based on market type
    // World Cup Final: July 19, 2026, 1:00 PM Costa Rica time (UTC-6) = 19:00 UTC
    const WORLD_CUP_FINAL_KICKOFF = new Date('2026-07-19T13:00:00-06:00');
    const WORLD_CUP_FINAL_ENDS = new Date('2026-07-19T15:00:00-06:00');
    
    let openUntil, settleAfter;
    
    if (futuresMarket.category === 'tournament') {
      // Tournament-wide markets (Winner, To Reach Final) close at final kickoff
      openUntil = Math.floor(WORLD_CUP_FINAL_KICKOFF.getTime() / 1000);
      settleAfter = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);
    } else if (futuresMarket.category === 'player') {
      // Golden Boot closes at final end time
      openUntil = Math.floor(WORLD_CUP_FINAL_ENDS.getTime() / 1000);
      settleAfter = openUntil + 7200; // 2 hours after for settlement
    } else {
      // Default: 24 hours from now for testing
      openUntil = Math.floor(Date.now() / 1000) + 86400;
      settleAfter = openUntil + 7200;
    }

    // Prepare create_market instruction
    const discriminator = Buffer.from(sha256("global:create_market")).slice(0, 8);

    // Build outcome names array (support up to 48 teams for World Cup)
    const maxOutcomes = Math.min(futuresMarket.outcomes?.length || 0, 48);
    const outcomeNames = Array.from({ length: maxOutcomes }, () => Buffer.alloc(32));
    
    futuresMarket.outcomes?.forEach((outcome, i) => {
      if (i < maxOutcomes) {
        Buffer.from(outcome.label || `Outcome ${i}`).copy(outcomeNames[i], 0, 0, Math.min(outcome.label?.length || 1, 32));
      }
    });

    // Build instruction data
    const paramsData = Buffer.alloc(32 + (32 * maxOutcomes) + 8 + 8 + 2 + 1 + (8 * maxOutcomes));
    let offset = 0;
    
    // match_id (32 bytes) - use futures market ID
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(futures_market_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(futures_market_id.length, 32));
    matchIdBytes.copy(paramsData, offset);
    offset += 32;
    
    // outcome_names (32 bytes each)
    outcomeNames.forEach(name => {
      name.copy(paramsData, offset);
      offset += 32;
    });
    
    // open_until (8 bytes)
    paramsData.writeBigInt64LE(BigInt(openUntil), offset);
    offset += 8;
    
    // settle_after (8 bytes)
    paramsData.writeBigInt64LE(BigInt(settleAfter), offset);
    offset += 8;
    
    // fee_percent (2 bytes) - 0 for now
    paramsData.writeUInt16LE(0, offset);
    offset += 2;
    
    // outcome_count (1 byte)
    paramsData.writeUInt8(maxOutcomes, offset);
    offset += 1;
    
    // oracle_odds (8 bytes each) - convert decimal odds to basis points
    futuresMarket.outcomes?.forEach((outcome, i) => {
      if (i < maxOutcomes) {
        const oddsBps = BigInt(Math.round((outcome.odds || 1) * 100));
        paramsData.writeBigUInt64LE(oddsBps, offset);
        offset += 8;
      }
    });

    const instructionData = Buffer.concat([discriminator, paramsData]);

    console.log('Futures Market PDA:', marketPda.toBase58());
    console.log('Instruction data length:', instructionData.length);
    console.log('Open until:', new Date(openUntil * 1000).toISOString());
    console.log('Settle after:', new Date(settleAfter * 1000).toISOString());

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
      initParams.writeUInt16LE(0, 0);
      initParams.writeUInt8(51, 2);
      const initInstructionData = Buffer.concat([initDiscriminator, initParams]);
      
      return Response.json({
        success: false,
        error: 'Platform config not initialized',
        needsPlatformInit: true,
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
        marketPda: marketPda.toBase58(),
        instruction_data: instructionData.toString('base64'),
        accounts: {
          market: marketPda.toBase58(),
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        }
      },
      message: 'Sign to create futures market on-chain',
      futures_market_id: futures_market_id,
    });

  } catch (error) {
    console.error('createFuturesMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});