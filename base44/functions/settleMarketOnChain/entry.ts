import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Settle a market on-chain by calling the Solana program's emergency_settle instruction.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Get wallet address from request header (set by frontend after wallet auth)
    const authHeader = req.headers.get('Authorization') || '';
    const walletToken = authHeader.replace('Bearer ', '');
    
    if (!walletToken) {
      return Response.json({ error: 'Unauthorized - no auth token' }, { status: 401 });
    }
    
    // Decode wallet token to get user info
    const [headerPart, payloadPart, signaturePart] = walletToken.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      return Response.json({ error: 'Invalid token format' }, { status: 401 });
    }
    
    // Decode payload (base58)
    const decoder = new TextDecoder();
    let tokenPayload;
    try {
      tokenPayload = JSON.parse(decoder.decode(bs58.decode(payloadPart)));
    } catch (e) {
      console.error('Token decode error:', e);
      return Response.json({ error: 'Failed to decode token' }, { status: 401 });
    }
    
    console.log('[settleMarketOnChain] Token payload:', tokenPayload);
    
    // Get user from database by wallet address
    const walletAddress = tokenPayload.walletAddress;
    if (!walletAddress) {
      return Response.json({ error: 'Invalid token - no wallet address' }, { status: 401 });
    }
    
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: walletAddress });
    const walletUser = walletUsers[0];
    
    if (!walletUser) {
      return Response.json({ error: 'Wallet user not found' }, { status: 404 });
    }
    
    // Get full user record
    const users = await serviceRole.entities.User.filter({ id: walletUser.id });
    const user = users[0];
    
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required', got_role: user.role }, { status: 403 });
    }

    const requestBody = await req.json();
    const { bet_id, winning_outcome } = requestBody;
    
    if (!bet_id || !winning_outcome || !['a', 'b', 'draw'].includes(winning_outcome)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const bets = await base44.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matches = await base44.entities.Match.filter({ id: bet.match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match.id.length, 32));

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

    const outcomeIndex = winning_outcome === 'a' ? 0 : winning_outcome === 'b' ? 1 : 2;

    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:emergency_settle'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(outcomeIndex, 8);

    // Get all active bets for this market to update after settlement
    const allBets = await serviceRole.entities.Bet.filter({ match_id: bet.match_id });
    
    // Calculate winning bets and update UserBet statuses
    const outcomeLabel = winning_outcome === 'a' ? bet.outcome_a : winning_outcome === 'b' ? bet.outcome_b : 'Draw';
    
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
          { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: true },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        instruction_data: data.toString('base64'),
      },
      // Data to commit after transaction succeeds
      commit_data: {
        bet_id: bet.id,
        match_id: bet.match_id,
        winning_outcome: winning_outcome,
        outcome_label: outcomeLabel,
        all_bet_ids: allBets.map(b => b.id),
      },
    });

  } catch (error) {
    console.error('settleMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});