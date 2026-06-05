import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

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
    
    // Validate admin wallet matches on-chain platform config
    const connection = new (await import('npm:@solana/web3.js@1.98.4')).Connection('https://api.devnet.solana.com', 'confirmed');
    const platformInfo = await connection.getAccountInfo(platformPda);
    if (!platformInfo) {
      return Response.json({ 
        error: 'Platform config not found on-chain. Run "Init Platform" first.',
        fix: 'Go to Admin > Platform tab > click "Init Platform"'
      }, { status: 400 });
    }
    
    const adminBytes = platformInfo.data.slice(8, 40);
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
    
    const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);
    if (!feeVaultInfo) {
      return Response.json({ error: 'Fee vault not found on-chain' }, { status: 400 });
    }

    // Fetch market account and validate
    let marketInfo;
    try {
      marketInfo = await connection.getAccountInfo(marketPda);
    } catch (accountErr) {
      console.error('[settleMarketOnChain] Failed to fetch market account:', accountErr.message);
      throw new Error('Failed to fetch market account: ' + accountErr.message);
    }
    
    if (!marketInfo || !marketInfo.data) {
      throw new Error('Market account not found on-chain. PDA: ' + marketPda.toBase58());
    }
    
    console.log('[settleMarketOnChain] Market account size:', marketInfo.data.length, 'bytes');
    console.log('[settleMarketOnChain] Market discriminator (hex):', marketInfo.data.slice(0, 8).toString('hex'));
    
    // Validate discriminator first
    const expectedDisc = Buffer.from(sha256('global:market')).slice(0, 8);
    const actualDisc = marketInfo.data.slice(0, 8);
    if (!expectedDisc.equals(actualDisc)) {
      console.error('[settleMarketOnChain] DISCRIMINATOR MISMATCH!');
      console.error('[settleMarketOnChain] Expected:', expectedDisc.toString('hex'));
      console.error('[settleMarketOnChain] Actual:', actualDisc.toString('hex'));
      throw new Error('Invalid market account - wrong discriminator. Account may be corrupted or from different program version.');
    }
    console.log('[settleMarketOnChain] ✓ Discriminator valid');
    
    // Parse settle_after timestamp (offset 72-80 in market account)
    try {
      const settleAfterBytes = marketInfo.data.slice(72, 80);
      const settleAfter = BigInt.asIntN(64, settleAfterBytes.readBigUInt64LE(0));
      const settleAfterSeconds = Number(settleAfter);
      const settleAfterDate = new Date(settleAfterSeconds * 1000);
      const now = Date.now();
      
      console.log('[settleMarketOnChain] settle_after timestamp:', settleAfterSeconds, '(' + settleAfterDate.toISOString() + ')');
      console.log('[settleMarketOnChain] Current timestamp:', Math.floor(now / 1000));
      
      if (now < settleAfterSeconds * 1000) {
        const secondsUntilSettle = settleAfterSeconds - Math.floor(now / 1000);
        const minutesUntilSettle = Math.ceil(secondsUntilSettle / 60);
        throw new Error(`Too early to settle. Wait ${minutesUntilSettle} more minute(s). settle_after: ${settleAfterDate.toISOString()}`);
      }
      console.log('[settleMarketOnChain] ✓ Settlement time reached');
    } catch (tsErr) {
      console.error('[settleMarketOnChain] Failed to parse settle_after timestamp:', tsErr.message);
      throw new Error('Invalid settle_after timestamp in market account: ' + tsErr.message);
    }

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

    const discriminator = Buffer.from(sha256('global:emergency_settle')).slice(0, 8);
    
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(outcomeIndex, 8);

    // Prepare on-chain instruction - DB updates happen AFTER tx confirms via commitSettlement
    const outcomeLabel = winning_outcome === 'a' ? bet.outcome_a : winning_outcome === 'b' ? bet.outcome_b : 'Draw';
    
    return Response.json({
      success: true,
      message: `Sign to settle market: ${outcomeLabel}`,
      solana_instruction: {
        instruction_type: 'settle_market',
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true }, // market
          { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false }, // platform_config
          { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true }, // fee_vault
          { pubkey: admin_wallet, isSigner: true, isWritable: true }, // admin
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false }, // system_program
        ],
        instruction_data: data.toString('base64'),
      },
      bet_id: bet_id,
      winning_outcome: winning_outcome,
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