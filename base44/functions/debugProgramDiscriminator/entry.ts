import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const programId = new PublicKey(Deno.env.get('SOLANA_PROGRAM_ID').trim());
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Check program account
    const programAccount = await connection.getAccountInfo(programId);
    
    // Check platform PDA
    const [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      programId
    );
    
    const platformAccount = await connection.getAccountInfo(platformPda);
    
    console.log('=== PROGRAM DEBUG ===');
    console.log('Program ID:', programId.toBase58());
    console.log('Program exists:', !!programAccount);
    console.log('Program executable:', programAccount?.executable);
    
    console.log('\n=== PLATFORM ACCOUNT ===');
    console.log('Platform PDA:', platformPda.toBase58());
    console.log('Platform exists:', !!platformAccount);
    
    if (platformAccount) {
      console.log('Platform owner:', platformAccount.owner.toBase58());
      console.log('Platform data length:', platformAccount.data.length);
      
      const data = Buffer.from(platformAccount.data);
      console.log('First 64 bytes (hex):', data.slice(0, 64).toString('hex'));
      
      if (data.length >= 52) {
        const discriminator = data.slice(0, 8).toString('hex');
        const admin = new PublicKey(data.slice(8, 40)).toBase58();
        const feePercent = data.readUInt16LE(40);
        
        console.log('\nParsed PlatformConfig:');
        console.log('  Discriminator:', discriminator);
        console.log('  Admin:', admin);
        console.log('  Fee %:', feePercent);
      }
    }

    return Response.json({
      success: true,
      programId: programId.toBase58(),
      programExists: !!programAccount,
      programExecutable: programAccount?.executable,
      platformPda: platformPda.toBase58(),
      platformExists: !!platformAccount,
      platformData: platformAccount ? {
        discriminator: Buffer.from(platformAccount.data.slice(0, 8)).toString('hex'),
        admin: new PublicKey(platformAccount.data.slice(8, 40)).toBase58(),
        feePercent: platformAccount.data.readUInt16LE(40),
      } : null,
    });

  } catch (error) {
    console.error('debugProgramDiscriminator error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});