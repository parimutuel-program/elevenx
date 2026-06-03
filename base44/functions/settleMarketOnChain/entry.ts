import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Settle a market on-chain by calling the Solana program's announce_winner instruction.
 * This sets market.settled = true on-chain, allowing players to claim winnings.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get wallet auth token from request headers (set by frontend's base44Client)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing authentication token' }, { status: 401 });
    }
    
    const authToken = authHeader.replace('Bearer ', '');
    
    // Decode and verify the wallet auth token (simple JWT-like format)
    const parts = authToken.split('.');
    if (parts.length !== 3) {
      console.error('[settleMarketOnChain] Invalid token format:', parts.length);
      return Response.json({ error: 'Invalid token format' }, { status: 401 });
    }
    
    const { subtle } = await import('node:crypto');
    const encoder = new TextEncoder();
    
    try {
      // Decode payload
      const payloadBytes = bs58.decode(parts[1]);
      const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
      
      console.log('[settleMarketOnChain] Decoded token payload:', payload);
      
      // Verify token hasn't expired
      if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
        throw new Error('Token expired');
      }
      
      // Verify signature - re-create signature and compare
      const secretKey = Deno.env.get('BASE44_APP_ID') || 'elevenx-secret';
      const keyData = encoder.encode(secretKey);
      const key = await subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const expectedSignature = await subtle.sign(
        'HMAC',
        key,
        encoder.encode(`${parts[0]}.${parts[1]}`)
      );
      
      const actualSignature = bs58.decode(parts[2]);
      
      // Compare signatures
      const expectedArray = new Uint8Array(expectedSignature);
      const valid = expectedArray.length === actualSignature.length &&
        expectedArray.every((byte, i) => byte === actualSignature[i]);
      
      if (!valid) {
        console.error('[settleMarketOnChain] Signature mismatch');
        console.error('[settleMarketOnChain] Expected:', Buffer.from(expectedArray).toString('hex'));
        console.error('[settleMarketOnChain] Actual:', Buffer.from(actualSignature).toString('hex'));
        throw new Error('Invalid token signature');
      }
      
      // Token is valid - payload contains userId, walletAddress, role
      console.log('[settleMarketOnChain] ✓ Authenticated wallet:', payload.walletAddress, 'role:', payload.role);
      
      if (payload.role !== 'admin') {
        return Response.json({ error: 'Admin access required', got_role: payload.role }, { status: 403 });
      }
      
    } catch (tokenErr) {
      console.error('[settleMarketOnChain] Token verification failed:', tokenErr.message);
      return Response.json({ error: 'Invalid authentication token', details: tokenErr.message }, { status: 401 });
    }

    // Get wallet address from request body (sent by frontend)
    const requestBody = await req.json();
    const { bet_id, winning_outcome, admin_wallet } = requestBody;
    
    console.log('[settleMarketOnChain] Request body:', requestBody);
    
    if (!admin_wallet) {
      console.error('[settleMarketOnChain] Missing admin_wallet in request:', { bet_id, winning_outcome, admin_wallet });
      return Response.json({ error: 'Missing admin_wallet in request', received: { bet_id, winning_outcome, admin_wallet } }, { status: 400 });
    }

    const adminWallet = admin_wallet.trim();
    console.log('[settleMarketOnChain] Admin wallet from request:', adminWallet);
    
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

    console.log(`[settleMarketOnChain] Settling bet ${bet_id} with outcome ${winning_outcome} (index: ${outcomeIndex})`);

    // Build instruction data: 8-byte Anchor discriminator + u8 outcome
    // Using emergency_settle for admin manual settlement
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:emergency_settle'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(outcomeIndex, 8);

    console.log('[settleMarketOnChain] Instruction data (hex):', data.toString('hex'));
    console.log('[settleMarketOnChain] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[settleMarketOnChain] Full instruction payload:', {
      instruction_type: 'settle_market',
      programId: SOLANA_PROGRAM_ID,
      keys: [
        { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: platformPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: adminWallet, isSigner: true, isWritable: true },
        { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
      ],
      instruction_data_base64: data.toString('base64'),
    });

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
          { pubkey: adminWallet, isSigner: true, isWritable: true }, // admin signer
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