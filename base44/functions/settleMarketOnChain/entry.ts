import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Settle a market on-chain by calling the Solana program's announce_winner instruction.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get authenticated user via Base44 SDK (platform handles auth)
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized - please login' }, { status: 401 });
    }
    
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required', got_role: user.role }, { status: 403 });
    }

    const requestBody = await req.json();
    const { bet_id, winning_outcome, admin_wallet } = requestBody;
    
    if (!admin_wallet) {
      return Response.json({ error: 'Missing admin_wallet in request' }, { status: 400 });
    }

    if (!bet_id || !winning_outcome || !['a', 'b', 'draw'].includes(winning_outcome)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Get the bet and match
    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await base44.entities.Match.filter({ id: bet.match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match.id.length, 32));

    // Derive PDAs
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Map outcome to u8 index (0=a, 1=b, 2=draw)
    const outcomeIndex = winning_outcome === 'a' ? 0 : winning_outcome === 'b' ? 1 : 2;

    // Build instruction data: 8-byte Anchor discriminator + u8 outcome
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:emergency_settle'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(outcomeIndex, 8);

    return Response.json({
      success: true,
      message: `Settle market on-chain for ${match.team_a} vs ${match.team_b}`,
      solana_instruction: {
        instruction_type: 'settle_market',
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: platformPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: admin_wallet, isSigner: true, isWritable: true },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        instruction_data: data.toString('base64'),
      },
    });

  } catch (error) {
    console.error('settleMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});