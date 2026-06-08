import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection, Transaction, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const walletAddress = payload.walletAddress;
    
    if (!walletAddress) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    // Verify user is admin
    const normalizedWallet = walletAddress.trim().toLowerCase();
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const walletUser = allWalletUsers.find(wu => wu.wallet_address?.trim().toLowerCase() === normalizedWallet);
    
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('=== FORCE REINIT PLATFORM ===');
    console.log('Admin wallet:', walletAddress);

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const adminPubkey = new PublicKey(walletAddress);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Use V3 seeds to guarantee fresh start
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_v3')],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault_v3')],
      programId
    );

    console.log('New PDAs:', {
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
    });

    // Check if old platform exists
    const accountInfo = await connection.getAccountInfo(platformPda);
    
    if (accountInfo) {
      console.log('Platform V3 exists, checking owner...');
      console.log('Owner:', accountInfo.owner.toBase58());
      console.log('Is program owner:', accountInfo.owner.equals(programId));
      
      if (accountInfo.owner.equals(programId)) {
        // Account exists and is owned by our program - parse and check if valid
        const data = Buffer.from(accountInfo.data);
        const adminBytes = data.slice(8, 40);
        const currentAdmin = new PublicKey(adminBytes).toBase58();
        
        console.log('Platform V3 admin:', currentAdmin);
        
        if (currentAdmin.toLowerCase() === walletAddress.toLowerCase()) {
          // Already initialized with THIS admin - success
          return Response.json({
            success: true,
            alreadyInitialized: true,
            currentAdmin,
            platformPda: platformPda.toBase58(),
            feeVaultPda: feeVaultPda.toBase58(),
            message: 'Platform already initialized with your wallet',
          });
        } else {
          // Initialized with DIFFERENT admin - need to close and recreate
          console.log('Platform initialized with different admin, closing...');
          // Can't close accounts from backend - need user to sign close instruction
          // For now, just return the init instruction and let them reinit
        }
      }
    }

    // Build initialization instruction
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
      version: 'v3',
    };

    console.log('Init instruction ready');

    return Response.json({
      success: true,
      platformExists: !!accountInfo,
      message: accountInfo ? 'Reinitializing platform V3' : 'Initializing platform V3',
      solana_instruction: instruction,
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      newAdmin: walletAddress,
      version: 'v3',
    });

  } catch (error) {
    console.error('forceReinitPlatform error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});