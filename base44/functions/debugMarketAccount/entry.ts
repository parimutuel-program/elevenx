import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Debug function to check market account details on-chain.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }
    
    const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    
    const payload = await req.json();
    const { match_id } = payload;
    
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    let marketPda;
    
    // Special case: check platform config instead of market
    if (match_id === 'platform') {
      const [platformConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('platform')],
        programId
      );
      marketPda = platformConfigPda;
      console.log('[debugMarketAccount] Checking platform config PDA:', marketPda.toBase58());
    } else {
      if (!match_id) {
        return Response.json({ error: 'Missing match_id' }, { status: 400 });
      }
      
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));
      
      // Derive market PDA
      const [marketPdaDerived] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), matchIdBytes],
        programId
      );
      marketPda = marketPdaDerived;
      console.log('[debugMarketAccount] Checking market PDA:', marketPda.toBase58());
    }
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    console.log('[debugMarketAccount] Checking account at PDA:', marketPda.toBase58());
    const accountInfo = await connection.getAccountInfo(marketPda);
    
    if (!accountInfo) {
      console.log('[debugMarketAccount] Account does not exist');
      return Response.json({
        exists: false,
        marketPda: marketPda.toBase58(),
        message: 'Account does not exist on-chain',
      });
    }
    
    console.log('[debugMarketAccount] Account exists:', {
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
    });
    
    // Try to parse the first 8 bytes as discriminator
    const discriminator = accountInfo.data.slice(0, 8);
    console.log('[debugMarketAccount] Discriminator (hex):', discriminator.toString('hex'));
    
    return Response.json({
      exists: true,
      marketPda: marketPda.toBase58(),
      size: accountInfo.data.length,
      lamports: accountInfo.lamports,
      owner: accountInfo.owner.toBase58(),
      discriminatorHex: discriminator.toString('hex'),
      dataSample: accountInfo.data.slice(0, 64).toString('hex'),
    });
    
  } catch (error) {
    console.error('debugMarketAccount error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});