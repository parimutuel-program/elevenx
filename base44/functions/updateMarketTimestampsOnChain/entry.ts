import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Update market timestamps on-chain (admin-only recovery tool).
 * Sets open_until and settle_after to valid times.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const payload = await req.json();
    const { bet_id, match_id, admin_wallet, mode = 'test' } = payload;

    if (!admin_wallet) {
      return Response.json({ error: 'admin_wallet required' }, { status: 400 });
    }

    // Verify admin via WalletUser entity
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: admin_wallet });
    const walletUser = walletUsers[0];
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!bet_id || !match_id || !admin_wallet) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const bets = await serviceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await serviceRole.entities.Match.filter({ id: match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    console.log('[updateMarketTimestampsOnChain] Program ID:', SOLANA_PROGRAM_ID);
    
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

    // Calculate timestamps - CRITICAL: open_until MUST be < settle_after
    const now = Math.floor(Date.now() / 1000);
    let openUntil, settleAfter;
    
    if (mode === 'test') {
      // Test mode: open_until = 1 hour ago, settle_after = now (allows immediate settlement)
      openUntil = now - 3600;
      settleAfter = now;
    } else {
      // Normal mode: set to future times based on match
      openUntil = Math.floor(new Date(bet.open_until).getTime() / 1000);
      settleAfter = openUntil + 7200; // 2 hours after betting closes
    }
    
    console.log('[updateMarketTimestampsOnChain] Calculated timestamps:', {
      now,
      openUntil,
      settleAfter,
      openUntilIso: new Date(openUntil * 1000).toISOString(),
      settleAfterIso: new Date(settleAfter * 1000).toISOString(),
    });

    // Build instruction data for update_market_timestamps (Anchor discriminator)
    // Note: This instruction must be deployed in the Solana program
    const { sha256: sha256fn } = await import('npm:@noble/hashes@1.4.0/sha256');
    const discriminator = Buffer.from(sha256fn('global:update_market_timestamps')).slice(0, 8);
    console.log('[updateMarketTimestampsOnChain] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[updateMarketTimestampsOnChain] Instruction name: global:update_market_timestamps');
    
    const data = Buffer.alloc(24);
    discriminator.copy(data, 0);
    data.writeBigInt64LE(BigInt(openUntil), 8);
    data.writeBigInt64LE(BigInt(settleAfter), 16);

    console.log('[updateMarketTimestampsOnChain] Instruction data (hex):', data.toString('hex'));
    console.log('[updateMarketTimestampsOnChain] Timestamps:', { openUntil, settleAfter, mode });

    const adminPubkey = new PublicKey(admin_wallet);

    return Response.json({
      success: true,
      message: `Update market timestamps (mode: ${mode})`,
      solana_instruction: {
        instruction_type: 'update_market_timestamps',
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: platformConfigPda.toBase58(), isSigner: false, isWritable: false },
          { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: false },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        instruction_data: data.toString('base64'),
      },
      timestamps: {
        open_until: new Date(openUntil * 1000).toISOString(),
        settle_after: new Date(settleAfter * 1000).toISOString(),
      },
    });

  } catch (error) {
    console.error('updateMarketTimestampsOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});