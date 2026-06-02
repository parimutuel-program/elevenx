import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'ElevenXProgramID1111111111111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Creates a market on-chain for a bet entity.
 * This must be called before LPs can provide liquidity.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const payload = await req.json();
    const { bet_id, match_id } = payload;

    if (!bet_id || !match_id) {
      return Response.json({ error: 'Missing bet_id or match_id' }, { status: 400 });
    }

    // Fetch Bet and Match
    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await base44.entities.Match.filter({ id: match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    // Derive market PDA
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    // Check if market already exists on-chain and is properly initialized
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (accountInfo) {
      // Market PDA exists - check if it's properly initialized
      const expectedMinSize = 200; // BetMarket struct should be ~215 bytes
      if (accountInfo.data.length < expectedMinSize) {
        console.log('Market exists but is not properly initialized:', {
          pda: marketPda.toBase58(),
          actualSize: accountInfo.data.length,
          expectedSize: expectedMinSize,
        });
        return Response.json({
          success: false,
          error: 'Market account exists but is not properly initialized. The market creation may have failed.',
          hint: 'The market PDA exists with incorrect size. This may require manual intervention or creating a new bet entity.',
          marketPda: marketPda.toBase58(),
          actualSize: accountInfo.data.length,
          needsReinitialization: true,
        }, { status: 400 });
      }
      
      // Market exists and is properly initialized
      console.log('Market already exists and is properly initialized at:', marketPda.toBase58());
      return Response.json({
        success: true,
        marketPda: marketPda.toBase58(),
        alreadyExists: true,
      });
    }

    // Prepare create_market instruction
    // Anchor discriminator for create_market (instruction index 1)
    const data = Buffer.alloc(8);
    data.writeUInt32LE(1, 0);
    data.writeUInt32LE(0, 4);

    // Prepare params for create_market
    // This needs to match the CreateMarketParams struct in the Solana program
    const openUntil = bet.open_until ? Math.floor(new Date(bet.open_until).getTime() / 1000) : Math.floor(Date.now() / 1000) + 86400;
    const settleAfter = openUntil + 3600; // 1 hour after betting closes

    // Convert outcome names to 32-byte arrays
    const outcomeNames = [
      Buffer.alloc(32),
      Buffer.alloc(32),
      Buffer.alloc(32),
    ];
    Buffer.from(bet.outcome_a || 'A').copy(outcomeNames[0], 0, 0, Math.min(bet.outcome_a?.length || 1, 32));
    Buffer.from(bet.outcome_b || 'B').copy(outcomeNames[1], 0, 0, Math.min(bet.outcome_b?.length || 1, 32));
    Buffer.from(bet.outcome_draw || 'Draw').copy(outcomeNames[2], 0, 0, Math.min(bet.outcome_draw?.length || 4, 32));

    // Oracle odds in basis points
    const oracleOdds = [
      bet.oracle_odds_a || 200,
      bet.oracle_odds_b || 300,
      bet.oracle_odds_draw || 320,
    ];

    // Additional data for create_market instruction
    // Format: discriminator (8) + params
    const paramsData = Buffer.alloc(100); // Adjust size as needed
    let offset = 0;
    
    // match_id (32 bytes)
    matchIdBytes.copy(paramsData, offset);
    offset += 32;
    
    // outcome_names (3 x 32 = 96 bytes)
    outcomeNames[0].copy(paramsData, offset);
    offset += 32;
    outcomeNames[1].copy(paramsData, offset);
    offset += 32;
    outcomeNames[2].copy(paramsData, offset);
    offset += 32;
    
    // open_until (i64 = 8 bytes)
    paramsData.writeBigInt64LE(BigInt(openUntil), offset);
    offset += 8;
    
    // settle_after (i64 = 8 bytes)
    paramsData.writeBigInt64LE(BigInt(settleAfter), offset);
    offset += 8;
    
    // fee_percent (u16 = 2 bytes)
    paramsData.writeUInt16LE(bet.fee_percent || 200, offset);
    offset += 2;
    
    // outcome_count (u8 = 1 byte) - 3 for football with draw
    paramsData.writeUInt8(3, offset);
    offset += 1;
    
    // oracle_odds (3 x u64 = 24 bytes)
    paramsData.writeBigUInt64LE(BigInt(oracleOdds[0]), offset);
    offset += 8;
    paramsData.writeBigUInt64LE(BigInt(oracleOdds[1]), offset);
    offset += 8;
    paramsData.writeBigUInt64LE(BigInt(oracleOdds[2]), offset);
    offset += 8;

    const instructionData = Buffer.concat([data, paramsData.slice(0, offset)]);

    const keys = [
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: programId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      alreadyExists: false,
      solana_instruction: {
        instruction_type: 'create_market',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        instruction_data: instructionData.toString('base64'),
      },
      message: 'Sign to create market on-chain',
    });

  } catch (error) {
    console.error('createMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});