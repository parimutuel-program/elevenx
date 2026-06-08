import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';

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
    
    // Verify user is admin by checking WalletUser entity
    // Normalize wallet address for comparison (remove whitespace, lowercase)
    const normalizedWallet = walletAddress.trim().toLowerCase();
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const walletUser = allWalletUsers.find(wu => wu.wallet_address?.trim().toLowerCase() === normalizedWallet);
    
    console.log('Wallet check:', {
      provided: walletAddress,
      normalized: normalizedWallet,
      found: !!walletUser,
      role: walletUser?.role,
      allWallets: allWalletUsers.map(w => ({ address: w.wallet_address, role: w.role })),
    });
    
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ 
        error: 'Admin only - this wallet is not registered as admin. Please connect the correct admin wallet or register this wallet first.',
        debug: {
          provided: walletAddress,
          found: !!walletUser,
          role: walletUser?.role,
        }
      }, { status: 403 });
    }

    console.log('Reinitializing platform with admin wallet:', walletAddress);

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const adminPubkey = new PublicKey(walletAddress);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Derive platform config PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Derive fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Check if platform already exists
    const accountInfo = await connection.getAccountInfo(platformPda);
    let isReinit = false;
    let currentAdmin = null;
    
    if (accountInfo) {
      isReinit = true;
      const data = Buffer.from(accountInfo.data);
      if (data.length >= 40) {
        currentAdmin = new PublicKey(data.slice(8, 40)).toBase58();
      }
      console.log('Platform already exists, current admin:', currentAdmin);
    }

    console.log('PDAs:', {
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      admin: adminPubkey.toBase58(),
      isReinit,
    });

    // Build initialize_platform instruction
    // Anchor layout: discriminator (8 bytes) + fee_percent (u16 = 2 bytes) = 10 bytes total
    // Admin is passed as an account, NOT in instruction data
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    const initData = Buffer.alloc(10);
    discriminator.copy(initData, 0);
    initData.writeUInt16LE(0, 8); // fee_percent = 0% (set to 0 for now)

    console.log('Init data (hex):', initData.toString('hex'));
    console.log('Init data length:', initData.length);
    console.log('Discriminator (hex):', discriminator.toString('hex'));

    const instruction = {
      instruction_type: 'initialize_platform',
      programId: SOLANA_PROGRAM_ID,
      accounts: {
        platformConfig: platformPda.toBase58(),
        feeVault: feeVaultPda.toBase58(),
      },
      instruction_data: initData.toString('base64'),
    };
    
    console.log('Returning instruction:', instruction);

    return Response.json({
      success: true,
      isReinit,
      currentAdmin,
      message: isReinit 
        ? `Reinitializing platform. Old admin: ${currentAdmin?.slice(0, 6)}...${currentAdmin?.slice(-6)}`
        : 'Platform init instruction ready. Sign this transaction to set yourself as admin.',
      solana_instruction: instruction,
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      newAdmin: walletAddress,
    });

  } catch (error) {
    console.error('reinitPlatformWithWallet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});