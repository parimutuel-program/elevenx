import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

Deno.serve(async (req) => {
  try {
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'SOLANA_PROGRAM_ID secret not configured' }, { status: 500 });
    }
    
    const base44 = createClientFromRequest(req);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Get program info
    const programInfo = await connection.getAccountInfo(programId);
    
    // Derive platform PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    // Check if platform exists
    const platformInfo = await connection.getAccountInfo(platformPda);
    
    // Get upgrade authority from program data account
    const [programDataPda] = PublicKey.findProgramAddressSync(
      [programId.toBuffer()],
      new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
    );
    
    const programDataInfo = await connection.getAccountInfo(programDataPda);
    let authority = null;
    if (programDataInfo && programDataInfo.data.length >= 44) {
      // Upgrade authority is at offset 4-36 in program data account
      authority = new PublicKey(programDataInfo.data.slice(4, 36)).toBase58();
    }
    
    console.log('Program status:', {
      programId: SOLANA_PROGRAM_ID,
      exists: programInfo !== null,
      platformPda: platformPda.toBase58(),
      platformExists: platformInfo !== null,
      upgradeAuthority: authority,
    });
    
    return Response.json({
      success: true,
      programId: SOLANA_PROGRAM_ID,
      programExists: programInfo !== null,
      programDataPda: programDataPda.toBase58(),
      upgradeAuthority: authority,
      platformPda: platformPda.toBase58(),
      platformExists: platformInfo !== null,
      platformData: platformInfo ? {
        lamports: platformInfo.lamports,
        dataLength: platformInfo.data.length,
        dataHex: platformInfo.data.slice(0, 64).toString('hex'),
      } : null,
      note: platformInfo 
        ? 'Platform already initialized. Use reinit endpoint or different admin wallet.'
        : 'Platform not initialized. You can initialize it now.',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});