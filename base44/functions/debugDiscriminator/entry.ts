import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || 'HmRP5jmZp3P7g2JH5QyYeaGZRRB6SUJm52pSzRNhwTbj';

/**
 * Debug function to check what discriminator format the deployed program expects.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Check if program is deployed
    const programInfo = await connection.getAccountInfo(programId);
    if (!programInfo) {
      return Response.json({
        error: 'Program not deployed at this address',
        programId: SOLANA_PROGRAM_ID,
      }, { status: 404 });
    }
    
    console.log('Program is deployed:', SOLANA_PROGRAM_ID);
    
    // Derive platform PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    // Check if platform exists
    const platformInfo = await connection.getAccountInfo(platformPda);
    
    // Calculate BOTH discriminator formats
    const discGlobal = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:initialize_platform'));
    const discSimple = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('initialize_platform'));
    
    const discriminatorGlobal = Buffer.from(new Uint8Array(discGlobal).slice(0, 8));
    const discriminatorSimple = Buffer.from(new Uint8Array(discSimple).slice(0, 8));
    
    return Response.json({
      success: true,
      programId: SOLANA_PROGRAM_ID,
      programDeployed: true,
      platformPda: platformPda.toBase58(),
      platformExists: platformInfo !== null,
      platformData: platformInfo ? {
        lamports: platformInfo.lamports,
        dataLength: platformInfo.data.length,
        owner: platformInfo.owner.toBase58(),
        dataHex: platformInfo.data.slice(0, 32).toString('hex'),
      } : null,
      discriminators: {
        global_format: {
          input: 'global:initialize_platform',
          hex: discriminatorGlobal.toString('hex'),
          base64: discriminatorGlobal.toString('base64'),
        },
        simple_format: {
          input: 'initialize_platform',
          hex: discriminatorSimple.toString('hex'),
          base64: discriminatorSimple.toString('base64'),
        },
      },
      instruction: {
        instruction_type: 'initialize_platform',
        programId: SOLANA_PROGRAM_ID,
        accounts: {
          platformConfig: platformPda.toBase58(),
          feeVault: '', // Will be derived
        },
        note: 'Use one of the discriminators above to test which format works',
      },
    });
  } catch (error) {
    console.error('debugDiscriminator error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});