import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

/**
 * Admin-only: Check the current balance of the fee vault on Solana.
 * Returns the total fees accumulated and available for withdrawal.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);

    // Derive fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Fetch fee vault account
    const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);
    
    if (!feeVaultInfo) {
      return Response.json({ 
        error: 'Fee vault not found on-chain',
        hint: 'Platform may not be initialized. Run "Init Platform" first.'
      }, { status: 404 });
    }

    // Parse fee vault data
    // FeeVault layout: discriminator(8) + total_fees(8) + bump(1) = 17 bytes
    const totalFeesLamports = feeVaultInfo.data.readBigUInt64LE(8);
    const totalFeesSOL = Number(totalFeesLamports) / 1e9;

    // Also get platform config to show admin wallet
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    const platformInfo = await connection.getAccountInfo(platformPda);
    let adminWallet = 'Unknown';
    if (platformInfo && platformInfo.data.length >= 40) {
      adminWallet = new PublicKey(platformInfo.data.slice(8, 40)).toBase58();
    }

    console.log('[checkFeeVault] Fee vault balance:', {
      feeVaultPda: feeVaultPda.toBase58(),
      totalFeesLamports: totalFeesLamports.toString(),
      totalFeesSOL,
      adminWallet,
    });

    return Response.json({
      success: true,
      feeVaultPda: feeVaultPda.toBase58(),
      totalFeesLamports: totalFeesLamports.toString(),
      totalFeesSOL,
      adminWallet,
      solscanUrl: `https://solscan.io/account/${feeVaultPda.toBase58()}?cluster=devnet`,
    });

  } catch (error) {
    console.error('checkFeeVault error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});