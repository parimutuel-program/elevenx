import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, Transaction, TransactionInstruction } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || 'wBhZVzWqxZ13NtbSAXE4nx2RLcBhS3v2nPoN7MXq9f7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive platform PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    // Derive fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );
    
    // Test ALL possible discriminator formats for force_settle_market
    const testFormats = [
      { name: 'snake_case (global:)', input: 'global:force_settle_market' },
      { name: 'snake_case (simple)', input: 'force_settle_market' },
      { name: 'camelCase (global:)', input: 'global:forceSettleMarket' },
      { name: 'camelCase (simple)', input: 'forceSettleMarket' },
      { name: 'PascalCase (global:)', input: 'global:ForceSettleMarket' },
      { name: 'PascalCase (simple)', input: 'ForceSettleMarket' },
      { name: 'SCREAMING_SNAKE (global:)', input: 'global:FORCE_SETTLE_MARKET' },
      { name: 'SCREAMING_SNAKE (simple)', input: 'FORCE_SETTLE_MARKET' },
    ];
    
    const results = [];
    
    for (const format of testFormats) {
      const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(format.input));
      const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
      
      // Create test instruction data (8 bytes disc + 1 byte outcome)
      const testData = Buffer.alloc(9);
      discriminator.copy(testData, 0);
      testData.writeUInt8(0, 8); // outcome = 0
      
      // Try to simulate the instruction
      try {
        const testIx = new TransactionInstruction({
          keys: [
            { pubkey: platformPda, isSigner: false, isWritable: true },
            { pubkey: feeVaultPda, isSigner: false, isWritable: true },
          ],
          programId,
          data: testData,
        });
        
        const tx = new Transaction();
        tx.add(testIx);
        
        // Simulate (will fail but gives us error details)
        try {
          await connection.simulateTransaction(tx);
          results.push({
            format: format.name,
            discriminator: discriminator.toString('hex'),
            status: 'SUCCESS (no error)',
          });
        } catch (simError: any) {
          const errorMsg = simError.message || '';
          const errorData = simError.value?.err || simError.err;
          
          // Check if it's a specific program error vs "fallback not supported"
          if (errorMsg.includes('Fallback') || errorMsg.includes('custom program error: 101')) {
            results.push({
              format: format.name,
              discriminator: discriminator.toString('hex'),
              status: 'FAILED - Fallback/101 error (wrong discriminator)',
            });
          } else if (errorData?.InstructionError) {
            const customCode = errorData.InstructionError[1]?.Custom;
            results.push({
              format: format.name,
              discriminator: discriminator.toString('hex'),
              status: `FAILED - Custom error ${customCode} (discriminator matched but logic failed)`,
            });
          } else {
            results.push({
              format: format.name,
              discriminator: discriminator.toString('hex'),
              status: `FAILED - ${errorMsg.slice(0, 100)}`,
            });
          }
        }
      } catch (err: any) {
        results.push({
          format: format.name,
          discriminator: discriminator.toString('hex'),
          status: `ERROR - ${err.message}`,
        });
      }
    }
    
    return Response.json({
      success: true,
      programId: SOLANA_PROGRAM_ID,
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      testResults: results,
      recommendation: 'Look for results that say "Custom error" (not "Fallback") - that means the discriminator matched!',
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});