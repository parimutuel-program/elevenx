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
    
    const requestBody = await req.json();
    const { bet_id, winning_outcome, admin_wallet } = requestBody;
    
    console.log('[settleMarketOnChain] Request body:', { bet_id, winning_outcome, admin_wallet });
    
    // Validate admin wallet address
    if (!admin_wallet) {
      return Response.json({ error: 'Admin wallet address required' }, { status: 400 });
    }
    
    // Get wallet user from database
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: admin_wallet });
    const walletUser = walletUsers[0];
    
    console.log('[settleMarketOnChain] Wallet user lookup result:', walletUser ? 'found' : 'not found');
    
    if (!walletUser) {
      const allWalletUsers = await serviceRole.entities.WalletUser.list();
      return Response.json({ 
        error: 'Wallet user not found', 
        received_wallet: admin_wallet,
        registered_wallets: allWalletUsers.map(w => w.wallet_address),
        hint: 'Please connect your Phantom wallet with the admin account'
      }, { status: 404 });
    }
    
    // Check admin role directly from WalletUser (no need to lookup system User table)
    if (walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin access required', got_role: walletUser.role }, { status: 403 });
    }

    if (!bet_id || !winning_outcome || !['a', 'b', 'draw'].includes(winning_outcome)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const bet = await serviceRole.entities.Bet.get(bet_id);
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const match = await serviceRole.entities.Match.get(bet.match_id);
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Use the bet's stored solana_market_pda if available (from createMarketOnChain)
    let marketPda;
    if (bet.solana_market_pda) {
      marketPda = new PublicKey(bet.solana_market_pda);
      console.log('[settleMarketOnChain] Using stored market PDA:', marketPda.toBase58());
    } else {
      // Fallback: derive from match_id
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(match.id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match.id.length, 32));
      const [derivedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), matchIdBytes],
        programId
      );
      marketPda = derivedPda;
      console.log('[settleMarketOnChain] Derived market PDA:', marketPda.toBase58());
    }

    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    console.log('[settleMarketOnChain] PDAs:', {
      market: marketPda.toBase58(),
      platform: platformPda.toBase58(),
      fee_vault: feeVaultPda.toBase58(),
    });
    
    // Debug: Check platform config on-chain
    const connection = new (await import('npm:@solana/web3.js@1.98.4')).Connection('https://api.devnet.solana.com', 'confirmed');
    try {
      const platformInfo = await connection.getAccountInfo(platformPda);
      if (platformInfo) {
        console.log('[settleMarketOnChain] Platform config exists, data length:', platformInfo.data.length);
        // Parse admin from platform config (bytes 8-40 based on initialize_platform)
        const adminBytes = platformInfo.data.slice(8, 40);
        const adminPubkey = new PublicKey(adminBytes);
        console.log('[settleMarketOnChain] Platform admin:', adminPubkey.toBase58());
        console.log('[settleMarketOnChain] Signing wallet:', admin_wallet);
        console.log('[settleMarketOnChain] Admin match:', adminPubkey.toBase58() === admin_wallet);
      } else {
        console.error('[settleMarketOnChain] Platform config NOT FOUND on-chain!');
      }
      
      const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);
      if (!feeVaultInfo) {
        console.error('[settleMarketOnChain] Fee vault NOT FOUND on-chain!');
      } else {
        console.log('[settleMarketOnChain] Fee vault exists');
      }
    } catch (debugErr) {
      console.error('[settleMarketOnChain] Debug check failed:', debugErr.message);
    }

    const outcomeIndex = winning_outcome === 'a' ? 0 : winning_outcome === 'b' ? 1 : 2;

    const { sha256 } = await import('npm:@noble/hashes@1.4.0/sha256');
    const discriminator = Buffer.from(sha256('global:emergency_settle')).slice(0, 8);
    
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