import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || 'wBhZVzWqxZ13NtbSAXE4nx2RLcBhS3v2nPoN7MXq9f7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Get actual program info
    const programAccount = await connection.getAccountInfo(programId);
    console.log('[testDiscriminatorsReal] Program deployed:', !!programAccount);
    console.log('[testDiscriminatorsReal] Program ID:', programId.toBase58());
    
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
    
    // Use a dummy fee payer (just for simulation)
    const dummyPayer = new PublicKey('11111111111111111111111111111111');
    
    // Test ALL discriminator formats with proper simulation
    const testFormats = [
      'global:force_settle_market',
      'force_settle_market',
      'global:forceSettleMarket',
      'forceSettleMarket',
      'global:ForceSettleMarket',
      'ForceSettleMarket',
      'global:FORCE_SETTLE_MARKET',
      'FORCE_SETTLE_MARKET',
      'global:submit_oracle_vote',
      'submit_oracle_vote',
      'global:SubmitOracleVote',
      'SubmitOracleVote',
    ];
    
    const results = [];
    
    for (const format of testFormats) {
      const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(format));
      const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
      
      // Create test instruction data (8 bytes disc + 1 byte outcome = 0)
      const testData = Buffer.alloc(9);
      discriminator.copy(testData, 0);
      testData.writeUInt8(0, 8);
      
      // Create instruction with minimal accounts
      const testIx = new TransactionInstruction({
        keys: [
          { pubkey: platformPda, isSigner: false, isWritable: true },
          { pubkey: feeVaultPda, isSigner: false, isWritable: true },
          { pubkey: dummyPayer, isSigner: true, isWritable: true },
        ],
        programId,
        data: testData,
      });
      
      const tx = new Transaction();
      tx.add(testIx);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = dummyPayer;
      
      try {
        const simResult = await connection.simulateTransaction(tx);
        console.log(`[testDiscriminatorsReal] ${format}:`, simResult.value);
        
        const logs = simResult.value.logs || [];
        const err = simResult.value.err;
        
        // Check for specific error patterns
        let status = 'Unknown';
        if (err) {
          const errStr = JSON.stringify(err);
          if (errStr.includes('Fallback') || errStr.includes('custom program error: 101')) {
            status = '❌ WRONG DISCRIMINATOR (Fallback/101)';
          } else if (errStr.includes('Custom')) {
            const match = errStr.match(/Custom["\s:]*(\d+)/);
            const code = match ? match[1] : 'unknown';
            status = `✅ DISCRIMINATOR MATCHED (Custom error ${code} - expected since we're not passing valid accounts)`;
          } else {
            status = `❌ Error: ${errStr}`;
          }
        } else if (logs.some(l => l.includes('Program consumed'))) {
          status = '✅ SUCCESS - Instruction executed!';
        } else {
          status = '✅ No error - discriminator likely correct';
        }
        
        results.push({
          format,
          discriminator: discriminator.toString('hex'),
          status,
        });
      } catch (simError: any) {
        results.push({
          format,
          discriminator: discriminator.toString('hex'),
          status: `❌ Simulation error: ${simError.message}`,
        });
      }
    }
    
    return Response.json({
      success: true,
      programId: SOLANA_PROGRAM_ID,
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      testResults: results,
      recommendation: 'Look for ✅ markers - those discriminators matched an instruction in the program',
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});