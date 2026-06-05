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

    // Check if market account exists and has correct discriminator
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo || marketInfo.data.length < 249) {
      console.log('[settleMarketOnChain] Market account missing or too small - doing DB-only settlement');
      const outcomeLabel = winning_outcome === 'a' ? bet.outcome_a : winning_outcome === 'b' ? bet.outcome_b : 'Draw';
      return Response.json({
        success: true,
        db_only: true,
        message: `Market account corrupted on-chain. DB settlement only for: ${outcomeLabel}`,
        bet_id: bet_id,
        winning_outcome: winning_outcome,
        note: 'Update DB directly - on-chain market account has invalid data',
      });
    }
    
    // Check settle_after timestamp - Error 6005 means it's still in the future
    // Market account layout: discriminator(8) + admin(32) + match_id(32) + open_until(i64) + settle_after(i64) + ...
    const settleAfterBytes = marketInfo.data.slice(72, 80);
    const settleAfter = BigInt.asIntN(64, settleAfterBytes.readBigUInt64LE(0));
    const settleAfterSeconds = Number(settleAfter);
    const settleAfterDate = new Date(settleAfterSeconds * 1000);
    const now = Date.now();
    
    console.log('[settleMarketOnChain] On-chain settle_after:', settleAfterDate.toISOString(), 'timestamp:', settleAfterSeconds);
    console.log('[settleMarketOnChain] Current time:', new Date(now).toISOString(), 'timestamp:', Math.floor(now / 1000));
    console.log('[settleMarketOnChain] Can settle?', now >= settleAfterSeconds * 1000);
    
    if (now < settleAfterSeconds * 1000) {
      console.log('[settleMarketOnChain] Too early to settle - returning fix timestamp instruction first');
      const secondsUntilSettle = settleAfterSeconds - Math.floor(now / 1000);
      return Response.json({
        error: 'TooEarlyToSettle',
        code: 6005,
        settle_after: settleAfterDate.toISOString(),
        current_time: new Date(now).toISOString(),
        seconds_until_settle: secondsUntilSettle,
        fix_required: 'update_market_timestamps',
        message: `Market settle time is ${secondsUntilSettle}s in the future. Fix timestamps first.`,
      }, { status: 400 });
    }
    
    // Check discriminator - should match BetMarket account type
    const marketDisc = marketInfo.data.slice(0, 8).toString('hex');
    const expectedDisc = Buffer.from(sha256("account:BetMarket")).slice(0, 8).toString('hex');
    console.log('[settleMarketOnChain] Market discriminator:', marketDisc, '(expected:', expectedDisc + ')');
    
    if (marketDisc !== expectedDisc) {
      console.log('[settleMarketOnChain] Market discriminator mismatch - doing DB-only settlement');
      const outcomeLabel = winning_outcome === 'a' ? bet.outcome_a : winning_outcome === 'b' ? bet.outcome_b : 'Draw';
      return Response.json({
        success: true,
        db_only: true,
        message: `Market account has invalid discriminator (${marketDisc}). DB settlement only for: ${outcomeLabel}`,
        bet_id: bet_id,
        winning_outcome: winning_outcome,
        note: 'On-chain market account was created with wrong data - using DB fallback',
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
    console.error('settleMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});