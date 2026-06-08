import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Get the program account info
    const programInfo = await connection.getAccountInfo(programId);
    
    if (!programInfo) {
      return Response.json({ 
        error: 'Program not found on Solana devnet',
        programId: SOLANA_PROGRAM_ID,
      }, { status: 404 });
    }
    
    console.log('Program account info:', {
      owner: programInfo.owner.toBase58(),
      executable: programInfo.executable,
      lamports: programInfo.lamports,
      dataLength: programInfo.data.length,
    });
    
    // The program data starts with the ELF binary, not discriminators
    // We need to check the actual instruction handler in the deployed program
    // by looking at the BPF loader
    
    // Instead, let's try to call the program with each discriminator format
    // and see which one doesn't return "Invalid instruction data"
    
    // Calculate all discriminator formats
    const discriminators = {
      global_snake: Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'))).slice(0, 8)),
      global_camel: Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initializePlatform'))).slice(0, 8)),
      simple_snake: Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('initialize_platform'))).slice(0, 8)),
      simple_camel: Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('initializePlatform'))).slice(0, 8)),
    };
    
    console.log('Discriminator formats:');
    for (const [name, disc] of Object.entries(discriminators)) {
      console.log(`  ${name}: ${disc.toString('hex')}`);
    }
    
    return Response.json({
      success: true,
      programId: SOLANA_PROGRAM_ID,
      programExists: true,
      programInfo: {
        owner: programInfo.owner.toBase58(),
        executable: programInfo.executable,
        lamports: programInfo.lamports,
        dataLength: programInfo.data.length,
      },
      discriminators: {
        global_snake: {
          input: 'global:initialize_platform',
          hex: discriminators.global_snake.toString('hex'),
          base64: discriminators.global_snake.toString('base64'),
        },
        global_camel: {
          input: 'global:initializePlatform',
          hex: discriminators.global_camel.toString('hex'),
          base64: discriminators.global_camel.toString('base64'),
        },
        simple_snake: {
          input: 'initialize_platform',
          hex: discriminators.simple_snake.toString('hex'),
          base64: discriminators.simple_snake.toString('base64'),
        },
        simple_camel: {
          input: 'initializePlatform',
          hex: discriminators.simple_camel.toString('hex'),
          base64: discriminators.simple_camel.toString('base64'),
        },
      },
      instruction: {
        instruction_type: 'initialize_platform',
        programId: SOLANA_PROGRAM_ID,
        note: 'Try each discriminator. Anchor 0.30.1 typically uses global:snake_case format.',
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});