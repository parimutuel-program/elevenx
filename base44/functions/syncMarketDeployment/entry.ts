import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

function getSolanaConfig() {
  let rawUrl = Deno.env.get('SOLANA_RPC_URL') || '';
  if (rawUrl.includes('RPC_URL=')) {
    rawUrl = rawUrl.split('RPC_URL=')[1].trim();
  }
  if (!rawUrl.startsWith('http') || rawUrl.includes('uuid')) {
    rawUrl = 'https://api.mainnet-beta.solana.com';
  }
  const rpcUrl = rawUrl;
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID') || '';
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Support both platform auth and wallet-based auth
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') isAdmin = true;
    } catch (_) {}

    if (!isAdmin) {
      try {
        const authHeader = req.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');
        if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.walletAddress) {
              const walletUsers = await base44.asServiceRole.entities.WalletUser.filter({ wallet_address: payload.walletAddress });
              if (walletUsers[0]?.role === 'admin') isAdmin = true;
            }
          }
        }
      } catch (_) {}
    }

    if (!isAdmin) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { programId, connection } = getSolanaConfig();
    
    // Get all bets
    const allBets = await base44.asServiceRole.entities.Bet.filter({});
    console.log(`[syncMarketDeployment] Checking ${allBets.length} bets...`);
    
    let updated = 0;
    let alreadyDeployed = 0;
    let notFound = 0;
    const updatedBets = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < allBets.length; i += batchSize) {
      const batch = allBets.slice(i, i + batchSize);
      
      for (const bet of batch) {
        // Skip if already marked as deployed
        if (bet.solana_market_created && bet.solana_market_pda) {
          alreadyDeployed++;
          continue;
        }
        
        // Derive market PDA
        const matchIdBytes = Buffer.alloc(32);
        Buffer.from(bet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(bet.match_id.length, 32));
        const [marketPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('market'), matchIdBytes],
          programId
        );
        
        // Check if market exists on-chain
        try {
          const accountInfo = await connection.getAccountInfo(marketPda);
          
          if (accountInfo && accountInfo.data.length > 0) {
            // Market exists - update database
            await base44.asServiceRole.entities.Bet.update(bet.id, {
              solana_market_created: true,
              solana_market_pda: marketPda.toBase58(),
            });
            
            updated++;
            updatedBets.push({
              bet_id: bet.id,
              match_id: bet.match_id,
              market_pda: marketPda.toBase58(),
            });
            
            console.log(`[syncMarketDeployment] ✓ Updated bet ${bet.id}: ${bet.title}`);
          } else {
            notFound++;
            console.log(`[syncMarketDeployment] ✗ Market not found for bet ${bet.id}`);
          }
        } catch (err) {
          notFound++;
          console.error(`[syncMarketDeployment] Error checking market for bet ${bet.id}:`, err.message);
        }
      }
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < allBets.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return Response.json({
      success: true,
      message: `✓ Sync complete! Updated ${updated} bets. ${alreadyDeployed} already deployed, ${notFound} not found on-chain.`,
      updated,
      alreadyDeployed,
      notFound,
      updatedBets,
    });
    
  } catch (error) {
    console.error('syncMarketDeployment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});