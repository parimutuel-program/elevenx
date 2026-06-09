import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '9nwxZGK9nceBL1hPHDgyKeEkvGVjKuHY3Cq6vADXQ7GS';

/**
 * Admin-only: Sweep SOL from a settled market account to fee vault.
 * Use this when funds are stuck in a market account after settlement.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const payload = await req.json();
    const marketPda = payload.market_pda;
    const adminWallet = payload.admin_wallet;

    if (!marketPda || !adminWallet) {
      return Response.json({ 
        error: 'Missing market_pda or admin_wallet',
        received: payload 
      }, { status: 400 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const marketPubkey = new PublicKey(marketPda);
    const adminPubkey = new PublicKey(adminWallet);

    // Fetch actual balance from Solana
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const balance = await connection.getBalance(marketPubkey);

    // Derive platform PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    console.log('[sweepMarketFunds] Preparing sweep:', {
      marketPda: marketPubkey.toBase58(),
      adminWallet: adminPubkey.toBase58(),
      platformPda: platformPda.toBase58(),
      balanceLamports: balance,
      balanceSOL: balance / 1e9,
    });

    // Check if market is settled/voided
    const marketInfo = await connection.getAccountInfo(marketPubkey);
    if (!marketInfo) {
      return Response.json({ error: 'Market account not found' }, { status: 404 });
    }

    // Parse market data to check settled status (byte 244 = settled, byte 245 = voided)
    const marketData = marketInfo.data;
    let isSettled = false;
    let isVoided = false;
    if (marketData.length >= 246) {
      isSettled = marketData[244] === 1;
      isVoided = marketData[245] === 1;
    }

    if (!isSettled && !isVoided) {
      return Response.json({ 
        error: 'Market must be settled or voided before sweeping',
        isSettled,
        isVoided 
      }, { status: 400 });
    }

    // Build sweep_market_funds instruction
    // Anchor uses "global:<instruction_name>" format
    const discriminator = Buffer.from(sha256('global:sweep_market_funds')).slice(0, 8);
    const data = Buffer.alloc(8); // Only discriminator, no args
    discriminator.copy(data, 0);
    
    console.log('[sweepMarketFunds] Discriminator (global:sweep_market_funds):', discriminator.toString('hex'));

    return Response.json({
      success: true,
      message: `Sign to sweep ${balance / 1e9} SOL from market account to your wallet`,
      balance: {
        lamports: balance,
        sol: balance / 1e9,
      },
      solana_instruction: {
        instruction_type: 'sweep_market_funds',
        programId: programId.toBase58(),
        instruction_data: data.toString('base64'),
        keys: [
          { pubkey: marketPubkey.toBase58(), isSigner: false, isWritable: true }, // market
          { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false }, // platform_config
          { pubkey: adminWallet, isSigner: true, isWritable: true }, // admin (signer + receiver)
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false }, // system_program
        ]
      }
    });
  } catch (error) {
    console.error('[sweepMarketFunds] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});