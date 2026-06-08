import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '5NNAN6zcTFvjYxTMDKtkKNaG6H2R8GS17Xridr1JEH9X';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const walletAddress = payload.walletAddress;
    
    if (!walletAddress) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    // Verify user is admin
    const normalizedWallet = walletAddress.trim().toLowerCase();
    const allWalletUsers = await base44.asServiceRole.entities.WalletUser.list();
    const walletUser = allWalletUsers.find(wu => wu.wallet_address?.trim().toLowerCase() === normalizedWallet);
    
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ 
        error: 'Admin only - register this wallet as admin first',
      }, { status: 403 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const adminPubkey = new PublicKey(walletAddress);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Use V2 seed to avoid conflict with old platform account
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_v2')],  // Changed seed to avoid 4100 error
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault_v2')],  // Changed seed to avoid conflicts
      programId
    );

    // Check if platform already exists
    const accountInfo = await connection.getAccountInfo(platformPda);
    
    if (accountInfo) {
      const data = Buffer.from(accountInfo.data);
      const currentAdmin = data.length >= 40 ? new PublicKey(data.slice(8, 40)).toBase58() : null;
      return Response.json({
        success: true,
        isReinit: true,
        alreadyInitialized: true,
        currentAdmin,
        message: `Platform V2 already initialized. Admin: ${currentAdmin?.slice(0, 6)}...${currentAdmin?.slice(-6)}`,
        platformPda: platformPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
      });
    }

    // Build initialize_platform instruction
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const initData = Buffer.alloc(10);
    discriminator.copy(initData, 0);
    initData.writeUInt16LE(0, 8); // fee_percent = 0%

    const instruction = {
      instruction_type: 'initialize_platform',
      programId: SOLANA_PROGRAM_ID,
      accounts: {
        platformConfig: platformPda.toBase58(),
        feeVault: feeVaultPda.toBase58(),
      },
      instruction_data: initData.toString('base64'),
    };

    return Response.json({
      success: true,
      platformExists: false,
      message: 'Platform V2 initialization ready',
      solana_instruction: instruction,
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      newAdmin: walletAddress,
      discriminator: discriminator.toString('hex'),
      note: 'Using V2 seeds to avoid 4100 error from old platform account',
    });

  } catch (error) {
    console.error('initPlatformV2 error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});