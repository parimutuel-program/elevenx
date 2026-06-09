import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '9nwxZGK9nceBL1hPHDgyKeEkvGVjKuHY3Cq6vADXQ7GS';

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
    console.log('[settleMarketOnChain] Looking up wallet:', admin_wallet);
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: admin_wallet });
    const walletUser = walletUsers[0];
    
    console.log('[settleMarketOnChain] Wallet user lookup result:', walletUser ? 'found' : 'not found', walletUser);
    
    if (!walletUser) {
      const allWalletUsers = await serviceRole.entities.WalletUser.list();
      console.log('[settleMarketOnChain] All registered wallets:', allWalletUsers.map(w => w.wallet_address));
      return Response.json({ 
        error: 'Wallet user not found in database', 
        received_wallet: admin_wallet,
        registered_wallets: allWalletUsers.map(w => w.wallet_address),
        hint: 'Go to Profile page and connect your wallet first, or use "Register Admin Wallet"'
      }, { status: 400 });
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

    // Derive oracle_vote and vote_tally PDAs early (needed for validation)
    const adminPubkey = new PublicKey(admin_wallet);
    const [oracleVotePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('oracle_vote'), marketPda.toBuffer(), adminPubkey.toBuffer()],
      programId
    );
    
    const [voteTallyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vote_tally'), marketPda.toBuffer()],
      programId
    );
    
    console.log('[settleMarketOnChain] PDAs:', {
      market: marketPda.toBase58(),
      platform: platformPda.toBase58(),
      fee_vault: feeVaultPda.toBase58(),
      oracle_vote: oracleVotePda.toBase58(),
      vote_tally: voteTallyPda.toBase58(),
    });
    
    // Validate admin wallet matches on-chain platform config
    const connection = new (await import('npm:@solana/web3.js@1.98.4')).Connection('https://api.devnet.solana.com', 'confirmed');
    const platformInfoValidate = await connection.getAccountInfo(platformPda);
    if (!platformInfoValidate) {
      return Response.json({ 
        error: 'Platform config not found on-chain. Run "Init Platform" first.',
        fix: 'Go to Admin > Platform tab > click "Init Platform"'
      }, { status: 400 });
    }
    
    const adminBytes = platformInfoValidate.data.slice(8, 40);
    const onChainAdmin = new PublicKey(adminBytes).toBase58();
    
    console.log('[settleMarketOnChain] On-chain admin:', onChainAdmin);
    console.log('[settleMarketOnChain] Your wallet:', admin_wallet);
    console.log('[settleMarketOnChain] Match:', onChainAdmin === admin_wallet);
    
    if (onChainAdmin !== admin_wallet) {
      return Response.json({ 
        error: 'Wallet mismatch! Your wallet is not the platform admin.',
        on_chain_admin: onChainAdmin,
        your_wallet: admin_wallet,
        fix: 'Connect Phantom with the admin account, or run "Reinit Platform" with your current wallet'
      }, { status: 403 });
    }
    
    const feeVaultInfoValidate = await connection.getAccountInfo(feeVaultPda);
    if (!feeVaultInfoValidate) {
      return Response.json({ error: 'Fee vault not found on-chain' }, { status: 400 });
    }

    // Fetch and validate ALL accounts before building transaction
    console.log('[settleMarketOnChain] Validating all PDAs...');
    
    // 1. Validate market account
    let marketInfo;
    try {
      marketInfo = await connection.getAccountInfo(marketPda);
      console.log('[settleMarketOnChain] Market account:', {
        exists: !!marketInfo,
        owner: marketInfo?.owner.toBase58(),
        dataSize: marketInfo?.data.length,
        expectedOwner: programId.toBase58(),
      });
    } catch (accountErr) {
      console.error('[settleMarketOnChain] Failed to fetch market account:', accountErr.message);
      throw new Error('Failed to fetch market account: ' + accountErr.message);
    }
    
    if (!marketInfo || !marketInfo.data) {
      throw new Error('Market account not found on-chain. PDA: ' + marketPda.toBase58());
    }
    
    if (!marketInfo.owner.equals(programId)) {
      throw new Error('Market account owned by wrong program! Expected: ' + programId.toBase58() + ', Got: ' + marketInfo.owner.toBase58());
    }
    
    // 2. Validate platform config (already validated above)
    console.log('[settleMarketOnChain] Platform config:', {
      exists: true,
      owner: platformInfoValidate.owner.toBase58(),
      dataSize: platformInfoValidate.data.length,
    });
    
    // 3. Validate fee vault (already validated above)
    console.log('[settleMarketOnChain] Fee vault:', {
      exists: true,
      owner: feeVaultInfoValidate.owner.toBase58(),
      dataSize: feeVaultInfoValidate.data.length,
    });
    
    // 4. Check vote_tally (may not exist yet - will be created by init_if_needed)
    const voteTallyInfo = await connection.getAccountInfo(voteTallyPda);
    console.log('[settleMarketOnChain] Vote tally:', {
      exists: !!voteTallyInfo,
      willCreate: !voteTallyInfo,
    });
    
    // 5. Check oracle_vote (will be created by init_if_needed)
    const oracleVoteInfo = await connection.getAccountInfo(oracleVotePda);
    console.log('[settleMarketOnChain] Oracle vote:', {
      exists: !!oracleVoteInfo,
      willCreate: !oracleVoteInfo,
    });
    
    console.log('[settleMarketOnChain] All PDA validations passed - proceeding with settlement');
    
    // Check if market is voided on-chain - if so, cannot settle normally
    // EXCEPTION: If settlement_finalized is already set, allow re-settlement to fix fee vault
    const marketData = marketInfo.data;
    let isVoided = false;
    let settlementFinalized = false;
    if (marketData.length >= 246) {
      const voidedByte = marketData[245];
      isVoided = voidedByte === 1;
      // Check settlement_finalized flag (byte 244)
      if (marketData.length >= 245) {
        const settledByte = marketData[244];
        settlementFinalized = settledByte === 1;
      }
    }
    
    console.log('[settleMarketOnChain] Market state:', {
      voided: isVoided,
      settlement_finalized: settlementFinalized,
      willProceed: settlementFinalized, // Allow re-settle if already finalized
    });
    
    if (isVoided && !settlementFinalized) {
      return Response.json({
        error: 'Market is already voided on-chain',
        hint: 'Voided markets cannot be settled normally. All bets should be refunded instead.',
        voided: true,
        action: 'Mark bets as refunded in DB and process refunds via claimRefund function'
      }, { status: 400 });
    }

    // Always update market timestamps before settling (ensures settle_after is in the past)
    // Anchor 0.30.1 uses "account:instruction_name" format for discriminators
    const now = Math.floor(Date.now() / 1000);
    const timestampDiscriminator = Buffer.from(sha256('account:update_market_timestamps')).slice(0, 8);
    const timestampData = Buffer.alloc(24); // 8 bytes discriminator + 8 bytes open_until + 8 bytes settle_after
    timestampDiscriminator.copy(timestampData, 0);
    timestampData.writeBigInt64LE(BigInt(now - 3600), 8);  // open_until = 1hr ago
    timestampData.writeBigInt64LE(BigInt(now - 1), 16);     // settle_after = 1 sec ago
    
    console.log('[settleMarketOnChain] Timestamp fix discriminator (account: format):', timestampDiscriminator.toString('hex'));
    console.log('[settleMarketOnChain] Timestamp data:', {
      open_until: now - 3600,
      settle_after: now - 1,
      data_hex: timestampData.toString('hex'),
    });
    
    const timestampInstruction = {
      instruction_type: 'update_market_timestamps',
      programId: SOLANA_PROGRAM_ID,
      keys: [
        { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false },
        { pubkey: admin_wallet, isSigner: true, isWritable: false },
        { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
      ],
      instruction_data: timestampData.toString('base64'),
    };

    // Handle void outcome separately
    if (winning_outcome === 'void') {
      console.log('[settleMarketOnChain] Voiding market - using DB-only settlement');
      return Response.json({
        success: true,
        db_only: true,
        message: 'Market voided - all bettors will be refunded',
        bet_id: bet_id,
        winning_outcome: 'void',
      });
    }
    
    const outcomeIndex = winning_outcome === 'a' ? 0 : winning_outcome === 'b' ? 1 : 2;
    const outcomeLabel = winning_outcome === 'a' ? bet.outcome_a : winning_outcome === 'b' ? bet.outcome_b : 'Draw';

    // CRITICAL FIX: Use account: discriminator format for Anchor 0.30.1
    // Anchor 0.30.1 uses sha256("account:instruction_name") for discriminators
    
    let settleInstruction;
    
    if (settlementFinalized || isVoided) {
      // Use force_settle_market - account: format
      const forceDiscriminator = Buffer.from(sha256('account:force_settle_market')).slice(0, 8);
      const forceData = Buffer.alloc(9);
      forceDiscriminator.copy(forceData, 0);
      forceData.writeUInt8(outcomeIndex, 8);
      
      console.log('[settleMarketOnChain] Using force_settle_market (account: format):', {
        outcome: outcomeLabel,
        outcomeIndex,
        discriminator: forceDiscriminator.toString('hex'),
      });
      
      settleInstruction = {
        instruction_type: 'settle_market_force',
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: admin_wallet, isSigner: true, isWritable: true },
          { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        instruction_data: forceData.toString('base64'),
      };
    } else {
      // Use submit_oracle_vote - account: format
      const discriminator = Buffer.from(sha256('account:submit_oracle_vote')).slice(0, 8);
      const data = Buffer.alloc(9);
      discriminator.copy(data, 0);
      data.writeUInt8(outcomeIndex, 8);
      
      console.log('[settleMarketOnChain] Using submit_oracle_vote (account: format):', {
        outcome: outcomeLabel,
        outcomeIndex,
        discriminator: discriminator.toString('hex'),
      });
      
      settleInstruction = {
        instruction_type: 'settle_market',
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: oracleVotePda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: voteTallyPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false },
          { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: admin_wallet, isSigner: true, isWritable: true },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        instruction_data: data.toString('base64'),
      };
    }

    return Response.json({
      success: true,
      message: `Sign to settle market: ${outcomeLabel}`,
      // Two-step: sign timestamps first, then settle
      timestamp_instruction: timestampInstruction,
      solana_instruction: settleInstruction,
      bet_id: bet_id,
      winning_outcome: winning_outcome,
      instruction_type: settlementFinalized || isVoided ? 'force_settle_market' : 'submit_oracle_vote',
    });

  } catch (error) {
    console.error('settleMarketOnChain error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });
    return Response.json({ 
      error: error.message,
      error_type: error.name,
      stack: error.stack,
    }, { status: 500 });
  }
});