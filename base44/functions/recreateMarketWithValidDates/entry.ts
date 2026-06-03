import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Update market timestamps to valid values (bypasses corrupted open_until check).
 * Uses the update_market_timestamps instruction which skips normal validation.
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

    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Set timestamps in the past to allow immediate settlement (for testing)
    // open_until must be < settle_after for the program to accept
    const openUntil = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
    const settleAfter = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

    // Build instruction data: 8-byte discriminator + open_until (i64) + settle_after (i64)
    const discriminator = Buffer.from(sha256("global:update_market_timestamps")).slice(0, 8);
    const data = Buffer.alloc(24);
    discriminator.copy(data, 0);
    data.writeBigInt64LE(BigInt(openUntil), 8);
    data.writeBigInt64LE(BigInt(settleAfter), 16);

    console.log('[recreateMarketWithValidDates] Instruction data (hex):', data.toString('hex'));
    console.log('[recreateMarketWithValidDates] open_until:', new Date(openUntil * 1000).toISOString());
    console.log('[recreateMarketWithValidDates] settle_after:', new Date(settleAfter * 1000).toISOString());

    return Response.json({
      success: true,
      marketPda: marketPda.toBase58(),
      solana_instruction: {
        instruction_type: 'update_market_timestamps',
        programId: SOLANA_PROGRAM_ID,
        accounts: {
          market: marketPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        },
        instruction_data: data.toString('base64'),
      },
      message: 'Sign to update market timestamps (settlement enabled)',
    });

  } catch (error) {
    console.error('recreateMarketWithValidDates error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});