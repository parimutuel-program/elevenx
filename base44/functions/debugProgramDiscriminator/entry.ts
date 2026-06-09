import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || 'wBhZVzWqxZ13NtbSAXE4nx2RLcBhS3v2nPoN7MXq9f7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Fetch the program's IDL to see the actual instruction names
    const idlAddress = await PublicKey.findProgramAddressSync(
      [],
      programId
    );
    
    console.log('[debugProgramDiscriminator] Program ID:', programId.toBase58());
    console.log('[debugProgramDiscriminator] IDL address attempt:', idlAddress[0].toBase58());
    
    // Try to fetch IDL account
    try {
      const idlAccount = await connection.getAccountInfo(idlAddress[0]);
      if (idlAccount) {
        const idlData = idlAccount.data;
        console.log('[debugProgramDiscriminator] IDL account found!');
        console.log('[debugProgramDiscriminator] IDL data length:', idlData.length);
        
        // Try to decode (IDL is borsh-encoded)
        // For now, just return the raw data
        return Response.json({
          success: true,
          idlFound: true,
          idlDataLength: idlData.length,
          idlDataBase64: idlData.toString('base64'),
        });
      }
    } catch (idlError) {
      console.log('[debugProgramDiscriminator] IDL account not found or error:', idlError.message);
    }
    
    // Alternative: Check the program account itself
    const programAccount = await connection.getAccountInfo(programId);
    console.log('[debugProgramDiscriminator] Program account:', {
      exists: !!programAccount,
      owner: programAccount?.owner.toBase58(),
      lamports: programAccount?.lamports,
    });
    
    return Response.json({
      success: true,
      programDeployed: !!programAccount,
      message: 'Check Solscan for the program IDL or use Anchor to fetch it',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});