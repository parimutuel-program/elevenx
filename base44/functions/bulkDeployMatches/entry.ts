import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Bulk deploy all match markets to Solana.
 * Creates Bet entities for matches without them, then deploys each market on-chain.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only - admin role required' }, { status: 403 });
    }

    // Get all matches
    const allMatches = await serviceRole.entities.Match.filter({});
    
    // Get all existing bets
    const allBets = await serviceRole.entities.Bet.filter({});
    
    // Find matches without bets
    const betByMatchId = {};
    allBets.forEach(bet => {
      betByMatchId[bet.match_id] = bet;
    });
    
    const matchesWithoutBets = allMatches.filter(m => !betByMatchId[m.id]);
    let matchesToDeploy = allMatches.filter(m => betByMatchId[m.id] && !betByMatchId[m.id].solana_market_created);

    console.log(`[bulkDeployMatches] Found ${matchesWithoutBets.length} matches without bets, ${matchesToDeploy.length} bets to deploy on-chain`);

    if (matchesWithoutBets.length === 0 && matchesToDeploy.length === 0) {
      return Response.json({ 
        message: 'All matches are already initialized on-chain',
        totalMatches: allMatches.length,
        alreadyDeployed: allBets.filter(b => b.solana_market_created).length,
      }, { status: 200 });
    }

    // Get program ID
    const PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!PROGRAM_ID) {
      return Response.json({ error: 'SOLANA_PROGRAM_ID not configured' }, { status: 500 });
    }

    const programId = new PublicKey(PROGRAM_ID);

    // Derive platform config PDA
    const [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('platform_config')],
      programId
    );

    const betsToCreate = [];

    // Step 1: Create Bet entities for matches without them
    for (const match of matchesWithoutBets) {
      const bet = await serviceRole.entities.Bet.create({
        match_id: match.id,
        title: `${match.team_a} vs ${match.team_b}`,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        outcome_draw: 'Draw',
        open_until: match.match_time,
        status: 'open',
        fee_percent: 0,
        odds_a: 2.1,
        odds_b: 2.1,
        odds_draw: 2.1,
        pool_a: 0,
        pool_b: 0,
        pool_draw: 0,
        total_pool: 0,
        total_bettors: 0,
        solana_market_created: false,
      });
      
      betsToCreate.push(bet);
      matchesToDeploy.push(bet);
    }

    console.log(`[bulkDeployMatches] Created ${betsToCreate.length} new bet entities`);

    // Step 2: Deploy each market on-chain
    let deployedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const bet of matchesToDeploy) {
      const match = allMatches.find(m => m.id === bet.match_id);
      if (!match) continue;

      try {
        // Derive market PDA
        const marketIdBytes = Buffer.alloc(32);
        Buffer.from(bet.id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(bet.id.length, 32));
        
        const [marketPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('market'), marketIdBytes],
          programId
        );

        // Derive vote tally PDA
        const [voteTallyPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('vote_tally'), marketIdBytes],
          programId
        );

        // Calculate settlement timestamp
        const openUntil = bet.open_until ? new Date(bet.open_until).getTime() : Date.now() + (24 * 60 * 60 * 1000);
        const settleTimestamp = Math.floor(openUntil / 1000);

        // Serialize market data
        const marketData = {
          title: bet.title,
          subtitle: `${match.team_a} vs ${match.team_b}`,
          category: 'match',
          country: '',
          country_flag: '',
          icon: '',
          open_until: Math.floor(openUntil / 1000),
          settle_timestamp: settleTimestamp,
          outcomes: [
            { label: bet.outcome_a, position: 'a', flag: match.team_a_flag || '', odds: bet.odds_a || 2.1, pool: bet.pool_a || 0, lp_offers: 0 },
            { label: bet.outcome_b, position: 'b', flag: match.team_b_flag || '', odds: bet.odds_b || 2.1, pool: bet.pool_b || 0, lp_offers: 0 },
            { label: bet.outcome_draw, position: 'draw', flag: '', odds: bet.odds_draw || 2.1, pool: bet.pool_draw || 0, lp_offers: 0 },
          ],
        };

        const instructionData = {
          discriminator: 'create_market',
          marketData,
        };

        const serializedData = JSON.stringify(instructionData);
        const instructionDataBase64 = Buffer.from(serializedData).toString('base64');

        const instruction = {
          instruction_type: 'create_market',
          programId: PROGRAM_ID,
          accounts: {
            market: marketPda.toBase58(),
            voteTally: voteTallyPda.toBase58(),
            platformConfig: platformConfigPda.toBase58(),
          },
          instruction_data: instructionDataBase64,
          betId: bet.id,
          matchId: match.id,
          marketPda: marketPda.toBase58(),
        };

        // Deploy on-chain
        const deployRes = await base44.functions.invoke('createMarketOnChain', {
          bet_id: bet.id,
          match_id: match.id,
          force_recreate: false,
        });

        if (deployRes.data.error) {
          failedCount++;
          errors.push(`Bet ${bet.id}: ${deployRes.data.error}`);
          continue;
        }

        // Update bet record
        await serviceRole.entities.Bet.update(bet.id, {
          solana_market_created: true,
          solana_market_pda: marketPda.toBase58(),
        });

        deployedCount++;
      } catch (err) {
        failedCount++;
        errors.push(`Bet ${bet.id}: ${err.message}`);
      }
    }

    console.log(`[bulkDeployMatches] Deployed ${deployedCount} markets, ${failedCount} failed`);

    return Response.json({
      success: true,
      deployed: deployedCount,
      failed: failedCount,
      betsCreated: betsToCreate.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `✓ Deployed ${deployedCount} markets (${failedCount} failed)`,
    });

  } catch (error) {
    console.error('bulkDeployMatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});