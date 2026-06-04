import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Recreate a market on-chain using create_market with timestamps set in the past,
 * so that settlement can be triggered immediately (for testing).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { bet_id, match_id } = payload;

    if (!bet_id || !match_id) {
      return Response.json({ error: 'Missing bet_id or match_id' }, { status: 400 });
    }

    const bets = await base44.asServiceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await base44.asServiceRole.entities.Match.filter({ id: match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const [voteTallyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vote_tally'), marketPda.toBuffer()],
      programId
    );

    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Get platform admin from on-chain config (not from frontend)
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const platformInfo = await connection.getAccountInfo(platformConfigPda);
    if (!platformInfo) {
      return Response.json({ error: 'Platform config not initialized' }, { status: 400 });
    }
    const adminPubkey = new PublicKey(platformInfo.data.slice(8, 40));
    const admin_wallet = adminPubkey.toBase58();
    console.log('[recreateMarketWithValidDates] Using platform admin:', admin_wallet);

    // If market already exists on-chain, issue void_market so we can recreate it fresh with past timestamps
    const accountInfo = await connection.getAccountInfo(marketPda);
    if (accountInfo && accountInfo.data.length >= 249) {
      // Parse settled/voided flags from account data (correct offsets after total_pending[3×8])
      const isSettled = accountInfo.data[244] === 1;
      const isVoided = accountInfo.data[245] === 1;
      console.log('[recreateMarketWithValidDates] Market exists, settled:', isSettled, 'voided:', isVoided);

      if (!isVoided && !isSettled) {
        // Void it first so create_market can reinitialize (market PDA is reused after void)
        const voidDisc = Buffer.from(sha256('global:void_market')).slice(0, 8);

        await base44.asServiceRole.entities.Bet.update(bet_id, {
          open_until: new Date(Date.now() - 7200000).toISOString(),
          status: 'closed',
        });

        return Response.json({
          success: true,
          marketPda: marketPda.toBase58(),
          step: 'void',
          message: 'Step 1: Sign to void the existing market, then click Test Mode again to recreate with past timestamps.',
          solana_instruction: {
            instruction_type: 'void_market',
            programId: SOLANA_PROGRAM_ID,
            keys: [
              { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
              { pubkey: platformConfigPda.toBase58(), isSigner: false, isWritable: false },
              { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: false },
            ],
            instruction_data: voidDisc.toString('base64'),
          },
        });
      }

      // Market is voided/settled — fall through to recreate with past timestamps below
      console.log('[recreateMarketWithValidDates] Market voided/settled, will recreate with past timestamps');
    }

    // open_until must be sufficiently in the future to remain valid after tx confirmation (~10-15s buffer).
    // settle_after must be > open_until. We set settle_after in the past so settlement can trigger immediately after recreation.
    const now = Math.floor(Date.now() / 1000);
    const openUntil = now + 600;  // 10 minutes from now (ensures window is open during tx confirmation)
    const settleAfter = now + 300; // 5 minutes from now (< open_until, but will be in past by time user wants to settle)

    console.log('[recreateMarketWithValidDates] openUntil:', new Date(openUntil * 1000).toISOString(), '(10 min from now)');
    console.log('[recreateMarketWithValidDates] settleAfter:', new Date(settleAfter * 1000).toISOString(), '(5 min from now, allows immediate settlement)');

    // Build create_market instruction data
    const discriminator = Buffer.from(sha256('global:create_market')).slice(0, 8);

    const outcomeNames = [Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32)];
    Buffer.from(bet.outcome_a || 'A').copy(outcomeNames[0], 0, 0, Math.min((bet.outcome_a || 'A').length, 32));
    Buffer.from(bet.outcome_b || 'B').copy(outcomeNames[1], 0, 0, Math.min((bet.outcome_b || 'B').length, 32));
    Buffer.from(bet.outcome_draw || 'Draw').copy(outcomeNames[2], 0, 0, Math.min((bet.outcome_draw || 'Draw').length, 32));

    // CreateMarketParams: match_id(32) + outcomes(96) + open_until(8) + settle_after(8) + fee_percent(2) + outcome_count(1) + oracle_odds(24) = 171 bytes
    const paramsData = Buffer.alloc(171);
    let offset = 0;

    matchIdBytes.copy(paramsData, offset); offset += 32;
    outcomeNames[0].copy(paramsData, offset); offset += 32;
    outcomeNames[1].copy(paramsData, offset); offset += 32;
    outcomeNames[2].copy(paramsData, offset); offset += 32;
    paramsData.writeBigInt64LE(BigInt(openUntil), offset); offset += 8;
    paramsData.writeBigInt64LE(BigInt(settleAfter), offset); offset += 8;
    paramsData.writeUInt16LE(bet.fee_percent || 200, offset); offset += 2;
    paramsData.writeUInt8(3, offset); offset += 1;

    const oddsA = BigInt(Math.round((bet.odds_a || 0) * 100));
    const oddsB = BigInt(Math.round((bet.odds_b || 0) * 100));
    const oddsDraw = BigInt(Math.round((bet.odds_draw || 0) * 100));
    paramsData.writeBigUInt64LE(oddsA, offset); offset += 8;
    paramsData.writeBigUInt64LE(oddsB, offset); offset += 8;
    paramsData.writeBigUInt64LE(oddsDraw, offset); offset += 8;

    const instructionData = Buffer.concat([discriminator, paramsData]);

    console.log('[recreateMarketWithValidDates] Discriminator:', discriminator.toString('hex'));
    console.log('[recreateMarketWithValidDates] Instruction data length:', instructionData.length);

    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      message: 'Sign to recreate market with past timestamps (settlement enabled immediately)',
      solana_instruction: {
        instruction_type: 'create_market',
        programId: SOLANA_PROGRAM_ID,
        instruction_data: instructionData.toString('base64'),
        accounts: {
          market: marketPda.toBase58(),
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
          admin: admin_wallet,
          systemProgram: '11111111111111111111111111111111',
        },
      },
    });

  } catch (error) {
    console.error('[recreateMarketWithValidDates] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});