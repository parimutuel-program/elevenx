import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Automatically void and recreate a corrupted market with correct admin and timestamps.
 * This is a one-click solution that handles both steps.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { bet_id, match_id, admin_wallet } = payload;

    if (!bet_id || !match_id || !admin_wallet) {
      return Response.json({ error: 'Missing bet_id, match_id, or admin_wallet' }, { status: 400 });
    }

    const bet = await base44.asServiceRole.entities.Bet.get(bet_id);
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const match = await base44.asServiceRole.entities.Match.get(match_id);
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

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    let needsVoid = false;
    if (accountInfo && accountInfo.data.length >= 249) {
      const isSettled = accountInfo.data[244] === 1;
      const isVoided = accountInfo.data[245] === 1;
      needsVoid = !isVoided && !isSettled;
    }

    // Step 1: Void existing market if needed
    if (needsVoid) {
      const voidDisc = Buffer.from(sha256('global:void_market')).slice(0, 8);
      const voidIx = new TransactionInstruction({
        keys: [
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: platformConfigPda, isSigner: false, isWritable: false },
          { pubkey: new PublicKey(admin_wallet), isSigner: true, isWritable: false },
        ],
        programId,
        data: voidDisc,
      });

      const tx = new Transaction().add(voidIx);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(admin_wallet);

      return Response.json({
        success: true,
        marketPda: marketPda.toBase58(),
        step: 'void',
        message: 'Step 1: Void corrupted market',
        transaction_base64: tx.serialize({ requireAllSignatures: false }).toString('base64'),
        next_payload: { bet_id, match_id, admin_wallet, step: 'create' },
      });
    }

    // Step 2: Create new market with valid timestamps
    const now = Math.floor(Date.now() / 1000);
    const openUntil = now + 300;  // 5 minutes from now
    const settleAfter = now + 360; // 6 minutes from now

    const discriminator = Buffer.from(sha256('global:create_market')).slice(0, 8);
    const outcomeNames = [Buffer.alloc(32), Buffer.alloc(32), Buffer.alloc(32)];
    Buffer.from(bet.outcome_a || 'A').copy(outcomeNames[0], 0, 0, Math.min((bet.outcome_a || 'A').length, 32));
    Buffer.from(bet.outcome_b || 'B').copy(outcomeNames[1], 0, 0, Math.min((bet.outcome_b || 'B').length, 32));
    Buffer.from(bet.outcome_draw || 'Draw').copy(outcomeNames[2], 0, 0, Math.min((bet.outcome_draw || 'Draw').length, 32));

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
    paramsData.writeBigUInt64LE(BigInt(Math.round((bet.odds_a || 0) * 100)), offset); offset += 8;
    paramsData.writeBigUInt64LE(BigInt(Math.round((bet.odds_b || 0) * 100)), offset); offset += 8;
    paramsData.writeBigUInt64LE(BigInt(Math.round((bet.odds_draw || 0) * 100)), offset); offset += 8;

    const instructionData = Buffer.concat([discriminator, paramsData]);

    const createIx = new TransactionInstruction({
      keys: [
        { pubkey: marketPda, isSigner: false, isWritable: true },
        { pubkey: voteTallyPda, isSigner: false, isWritable: true },
        { pubkey: platformConfigPda, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(admin_wallet), isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: instructionData,
    });

    const tx = new Transaction().add(createIx);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = new PublicKey(admin_wallet);

    // Update DB
    await base44.asServiceRole.entities.Bet.update(bet_id, {
      open_until: new Date(openUntil * 1000).toISOString(),
      status: 'open',
      solana_market_created: true,
      solana_market_pda: marketPda.toBase58(),
    });

    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      step: 'create',
      message: 'Step 2: Create new market with correct admin',
      transaction_base64: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      db_updated: true,
    });

  } catch (error) {
    console.error('[autoRecreateMarket] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});