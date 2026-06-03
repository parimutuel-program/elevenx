import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

const SOLANA_PROGRAM_ID = '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';
const RPC_URL = 'https://api.devnet.solana.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return Response.json({ error: 'Wallet address required' }, { status: 400 });
    }

    console.log('Reinitializing platform with admin wallet:', walletAddress);

    const connection = new Connection(RPC_URL, 'confirmed');
    const adminPubkey = new PublicKey(walletAddress);

    // Derive platform config PDA (must match original)
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      new PublicKey(SOLANA_PROGRAM_ID)
    );

    // Derive fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      new PublicKey(SOLANA_PROGRAM_ID)
    );

    console.log('PDAs:', {
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      admin: adminPubkey.toBase58(),
    });

    // Build initialize_platform instruction
    const discriminator = await sha256Discriminator('initialize_platform');
    const initData = Buffer.alloc(8 + 8 + 8); // discriminator + fee_percent (u64) + consensus_threshold (u64)
    discriminator.copy(initData, 0);
    initData.writeBigUInt64LE(BigInt(200), 8); // fee_percent = 2% (200 bps)
    initData.writeBigUInt64LE(BigInt(2), 16); // consensus_threshold = 2

    const keys = [
      { pubkey: platformPda, isSigner: false, isWritable: true },
      { pubkey: feeVaultPda, isSigner: false, isWritable: true },
      { pubkey: adminPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

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
      message: 'Platform reinit instruction ready. Sign this transaction to update admin.',
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

async function sha256Discriminator(name: string): Promise<Buffer> {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}