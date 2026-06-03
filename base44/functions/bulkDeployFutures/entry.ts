import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Bulk deploy all futures markets to Solana in a single transaction batch.
 * Returns array of instructions for client-side signing.
 */

/**
 * Deploy ALL futures markets to Solana in a single transaction.
 * Creates instructions for initializing all markets at once.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all futures markets that are not yet deployed
    const allMarkets = await base44.asServiceRole.entities.FuturesMarket.filter({});
    const marketsToDeploy = allMarkets.filter(m => !m.solana_market_created && m.status === 'open');

    if (marketsToDeploy.length === 0) {
      return Response.json({ 
        error: 'No markets to deploy. All markets are already deployed or closed.',
        alreadyDeployed: allMarkets.filter(m => m.solana_market_created).length,
      }, { status: 400 });
    }

    console.log(`[bulkDeployFutures] Deploying ${marketsToDeploy.length} markets to Solana`);

    // Get program ID
    const PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!PROGRAM_ID) {
      return Response.json({ error: 'SOLANA__PROGRAM_ID not configured' }, { status: 500 });
    }

    const programId = new PublicKey(PROGRAM_ID);

    // Derive platform config PDA (needed for all markets)
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_config')],
      programId
    );

    // Build instructions for all markets
    const instructions = [];
    const marketUpdates = [];

    for (const market of marketsToDeploy) {
      // Validate market has exactly 3 outcomes
      if (!market.outcomes || market.outcomes.length !== 3) {
        console.error(`[bulkDeployFutures] Market ${market.id} has invalid outcomes:`, market.outcomes);
        continue;
      }

      // Derive market PDA
      const marketIdBytes = Buffer.alloc(32);
      Buffer.from(market.id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(market.id.length, 32));
      
      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), marketIdBytes],
        programId
      );

      // Derive vote tally PDA
      const [voteTallyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vote_tally'), marketIdBytes],
        programId
      );

      // Calculate settlement timestamp based on category
      const now = Date.now();
      const openUntil = market.open_until ? new Date(market.open_until).getTime() : now + (30 * 24 * 60 * 60 * 1000);
      const settleTimestamp = Math.floor(openUntil / 1000);

      // Serialize market data for instruction (171 bytes total)
      const outcomeData = market.outcomes.map(o => ({
        label: o.label,
        position: o.position,
        flag: o.flag || '',
        odds: o.odds,
        pool: o.pool || 0,
        lp_offers: o.lp_offers || 0,
      }));

      const marketData = {
        title: market.title || `${market.country} Futures`,
        subtitle: market.subtitle || `Where will ${market.country} finish?`,
        category: market.category || 'tournament',
        country: market.country || 'Unknown',
        country_flag: market.country_flag || '',
        icon: market.icon || '',
        open_until: Math.floor(openUntil / 1000),
        settle_timestamp: settleTimestamp,
        outcomes: outcomeData,
      };

      const instructionData = {
        discriminator: 'create_market',
        marketData,
      };

      const serializedData = JSON.stringify(instructionData);
      const instructionDataBase64 = Buffer.from(serializedData).toString('base64');

      console.log(`[bulkDeployFutures] Prepared market ${market.country} (${market.id})`);

      instructions.push({
        instruction_type: 'create_market',
        programId: PROGRAM_ID,
        accounts: {
          market: marketPda.toBase58(),
          voteTally: voteTallyPda.toBase58(),
          platformConfig: platformConfigPda.toBase58(),
        },
        instruction_data: instructionDataBase64,
        marketId: market.id,
        marketPda: marketPda.toBase58(),
      });

      marketUpdates.push({
        id: market.id,
        solana_market_pda: marketPda.toBase58(),
      });
    }

    if (instructions.length === 0) {
      return Response.json({ error: 'Failed to prepare any market instructions' }, { status: 500 });
    }

    console.log(`[bulkDeployFutures] Total instructions: ${instructions.length}`);

    return Response.json({
      success: true,
      instructions,
      marketUpdates,
      marketCount: instructions.length,
      message: `Ready to deploy ${instructions.length} futures markets to Solana`,
    });

  } catch (error) {
    console.error('bulkDeployFutures error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});