import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection, Transaction, SystemProgram, TransactionInstruction } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID.trim());
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Derive PDAs
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    console.log('=== TESTING DISCRIMINATORS ON-CHAIN ===');
    console.log('Program ID:', programId.toBase58());
    console.log('Platform PDA:', platformPda.toBase58());
    console.log('Fee Vault PDA:', feeVaultPda.toBase58());

    // Test all 4 discriminator formats
    const formats = [
      { name: 'global:initialize_platform', hash: 'global:initialize_platform' },
      { name: 'initialize_platform', hash: 'initialize_platform' },
      { name: 'global:initializePlatform', hash: 'global:initializePlatform' },
      { name: 'initializePlatform', hash: 'initializePlatform' },
    ];

    const results = [];

    for (const format of formats) {
      try {
        const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(format.hash));
        const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
        
        // Build instruction data: discriminator (8) + fee_percent u16 LE (2) = 10 bytes
        const initData = Buffer.alloc(10);
        discriminator.copy(initData, 0);
        initData.writeUInt16LE(0, 8);

        // Build transaction
        const transaction = new Transaction();
        const keys = [
          { pubkey: platformPda, isSigner: false, isWritable: true },
          { pubkey: feeVaultPda, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(user.wallet_address || user.email), isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];

        const ix = new TransactionInstruction({
          keys,
          programId,
          data: initData,
        });

        transaction.add(ix);

        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = new PublicKey(user.wallet_address || user.email);

        // Try to simulate the transaction (will fail but gives us the error)
        try {
          const simulation = await connection.simulateTransaction(transaction, {
            sigVerify: false,
            commit: 'processed',
          });

          console.log(`\n${format.name}:`);
          console.log('  Discriminator:', discriminator.toString('hex'));
          console.log('  Simulation logs:', simulation.value.logs);
          console.log('  Simulation error:', simulation.value.err);
          console.log('  Units consumed:', simulation.value.unitsConsumed);

          results.push({
            format: format.name,
            discriminator: discriminator.toString('hex'),
            success: !simulation.value.err,
            error: simulation.value.err,
            logs: simulation.value.logs,
            unitsConsumed: simulation.value.unitsConsumed,
          });
        } catch (simError) {
          console.log(`\n${format.name}: SIMULATION FAILED`);
          console.log('  Error:', simError.message);
          
          results.push({
            format: format.name,
            discriminator: discriminator.toString('hex'),
            success: false,
            error: simError.message,
          });
        }
      } catch (err) {
        console.log(`\n${format.name}: SETUP FAILED`);
        console.log('  Error:', err.message);
        
        results.push({
          format: format.name,
          discriminator: null,
          success: false,
          error: err.message,
        });
      }
    }

    return Response.json({
      success: true,
      programId: programId.toBase58(),
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      results,
    });

  } catch (error) {
    console.error('testDirectDiscriminators error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});