import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';

/**
 * Check if a specific program ID exists on Solana devnet.
 */
Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const programIdToCheck = payload.programId || 'wBhZVzWqxZ13NtbSAXE4nx2RLcBhS3v2nPoN7MXq9f7';
    
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programPubkey = new PublicKey(programIdToCheck);
    
    console.log('[verifyProgramDeployment] Checking program:', programIdToCheck);
    
    const accountInfo = await connection.getAccountInfo(programPubkey);
    
    if (!accountInfo) {
      return Response.json({
        exists: false,
        programId: programIdToCheck,
        message: 'Program NOT found on Solana devnet',
        solscanUrl: `https://solscan.io/account/${programIdToCheck}?cluster=devnet`,
      });
    }
    
    console.log('[verifyProgramDeployment] Program found!', {
      owner: accountInfo.owner.toBase58(),
      executable: accountInfo.executable,
      lamports: accountInfo.lamports,
      dataLength: accountInfo.data.length,
    });
    
    return Response.json({
      exists: true,
      programId: programIdToCheck,
      owner: accountInfo.owner.toBase58(),
      executable: accountInfo.executable,
      lamports: accountInfo.lamports,
      dataLength: accountInfo.data.length,
      message: 'Program IS deployed on Solana devnet',
      solscanUrl: `https://solscan.io/account/${programIdToCheck}?cluster=devnet`,
    });
    
  } catch (error) {
    console.error('verifyProgramDeployment error:', error);
    return Response.json({ 
      error: error.message,
      programId: programIdToCheck,
    }, { status: 500 });
  }
});