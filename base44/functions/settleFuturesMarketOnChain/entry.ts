import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');

/**
 * Settle a futures market on-chain by calling the Solana program's emergency_settle instruction.
 * Returns a Solana transaction for the admin to sign.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const requestBody = await req.json();
    const { futures_market_id, winning_position, admin_wallet } = requestBody;
    
    console.log('[settleFuturesMarketOnChain] Request:', { futures_market_id, winning_position, admin_wallet });
    
    // Validate admin wallet
    if (!admin_wallet) {
      return Response.json({ error: 'Admin wallet address required' }, { status: 400 });
    }
    
    // Get wallet user and verify admin role
    const walletUsers = await serviceRole.entities.WalletUser.filter({ wallet_address: admin_wallet });
    const walletUser = walletUsers[0];
    
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get futures market
    const market = await serviceRole.entities.FuturesMarket.get(futures_market_id);
    if (!market) {
      return Response.json({ error: 'Futures market not found' }, { status: 404 });
    }

    if (market.status === 'settled') {
      return Response.json({ error: 'Market already settled' }, { status: 400 });
    }

    // Check if betting window has closed (allow admin to settle only after open_until)
    const now = new Date();
    const openUntil = new Date(market.open_until);
    if (now < openUntil) {
      return Response.json({ 
        error: `Cannot settle yet. Betting window closes at ${openUntil.toISOString()}`,
        current_time: now.toISOString(),
        open_until: openUntil.toISOString()
      }, { status: 400 });
    }

    // Convert winning_position to outcome index (0=1st, 1=2nd, 2=3rd)
    const positionToIndex = { '1st': 0, '2nd': 1, '3rd': 2 };
    const outcomeIndex = positionToIndex[winning_position];
    
    if (outcomeIndex === undefined) {
      return Response.json({ error: 'Invalid winning_position. Must be "1st", "2nd", or "3rd"' }, { status: 400 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive market PDA from futures_market_id
    const marketIdBytes = Buffer.from(futures_market_id.padEnd(32, '\0').slice(0, 32));
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketIdBytes],
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

    console.log('[settleFuturesMarketOnChain] PDAs:', {
      market: marketPda.toBase58(),
      platform: platformPda.toBase58(),
      fee_vault: feeVaultPda.toBase58(),
    });
    
    // Validate on-chain platform config and admin
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const platformInfo = await connection.getAccountInfo(platformPda);
    
    if (!platformInfo) {
      return Response.json({ error: 'Platform config not found on-chain' }, { status: 400 });
    }
    
    const adminBytes = platformInfo.data.slice(8, 40);
    const onChainAdmin = new PublicKey(adminBytes).toBase58();
    
    if (onChainAdmin !== admin_wallet) {
      return Response.json({ 
        error: 'Wallet mismatch! Your wallet is not the platform admin.',
        on_chain_admin: onChainAdmin,
        your_wallet: admin_wallet
      }, { status: 403 });
    }
    
    const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);
    if (!feeVaultInfo) {
      return Response.json({ error: 'Fee vault not found on-chain' }, { status: 400 });
    }

    // Build emergency_settle instruction - Anchor uses "global:<name>" format
    const discriminator = Buffer.from(sha256('global:emergency_settle')).slice(0, 8);
    console.log('[settleFuturesMarketOnChain] Discriminator:', {
      input: 'global:emergency_settle',
      hex: discriminator.toString('hex'),
    });
    
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(outcomeIndex, 8);

    console.log('[settleFuturesMarketOnChain] Prepared emergency_settle instruction:', {
      winning_position,
      outcomeIndex,
      discriminator: discriminator.toString('hex'),
      data: data.toString('hex'),
    });
    
    return Response.json({
      success: true,
      message: `Sign to settle ${market.country} futures: ${winning_position} place`,
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
      futures_market_id,
      winning_position,
    });

  } catch (error) {
    console.error('settleFuturesMarketOnChain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});