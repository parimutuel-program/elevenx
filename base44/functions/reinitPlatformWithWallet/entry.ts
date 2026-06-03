import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Use service role to avoid auth check - admin verification done via wallet address match
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const walletAddress = payload.walletAddress;
    
    if (!walletAddress) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    // Verify user is admin by checking WalletUser entity
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const walletUser = allWalletUsers.find(wu => wu.wallet_address === walletAddress);
    
    if (!walletUser || walletUser.role !== 'admin') {
      return Response.json({ error: 'Admin only - this wallet is not registered as admin' }, { status: 403 });
    }

    if (!walletAddress) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }

    console.log('Reinitializing platform with admin wallet:', walletAddress);

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const adminPubkey = new PublicKey(walletAddress);

    // Derive platform config PDA (must match original)
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    // Derive fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    console.log('PDAs:', {
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      admin: adminPubkey.toBase58(),
    });

    // Build initialize_platform instruction with admin pubkey embedded
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    // Layout: discriminator (8) + admin (32) + fee_percent (2) = 42 bytes
    const initData = Buffer.alloc(42);
    discriminator.copy(initData, 0);
    Buffer.from(adminPubkey.toBytes()).copy(initData, 8);
    initData.writeUInt16LE(200, 40); // fee_percent = 2% (200 bps)

    console.log('Init data (hex):', initData.toString('hex'));

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
      message: 'Platform reinit instruction ready. Sign this transaction to set yourself as admin.',
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