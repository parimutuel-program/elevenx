import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';

/**
 * Comprehensive platform test - checks all critical systems
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    const results = {};
    const recommendations = [];
    
    // 1. Platform Config Check
    console.log('[Test] Checking platform config...');
    const [platformConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
    const platformInfo = await connection.getAccountInfo(platformConfigPda);
    
    results.platformConfig = {
      status: platformInfo ? 'PASSED' : 'FAILED',
      initialized: !!platformInfo,
      platformPda: platformConfigPda.toBase58(),
    };
    
    if (!platformInfo) {
      recommendations.push('Initialize platform config via /init-platform');
    }
    
    // 2. Market Creation Check
    console.log('[Test] Checking markets...');
    const allBets = await serviceRole.entities.Bet.list();
    const onChainMarkets = [];
    
    for (const bet of allBets.filter(b => b.solana_market_created)) {
      const matchIdBytes = Buffer.alloc(32);
      Buffer.from(bet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(bet.match_id.length, 32));
      const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
      const marketInfo = await connection.getAccountInfo(marketPda);
      
      if (marketInfo) {
        onChainMarkets.push({
          bet_id: bet.id,
          marketPda: marketPda.toBase58(),
          size: marketInfo.data.length,
        });
      }
    }
    
    results.marketCreation = {
      status: onChainMarkets.length > 0 ? 'PASSED' : 'WARNING',
      totalMarkets: allBets.length,
      onChainMarkets: onChainMarkets.length,
      markets: onChainMarkets,
    };
    
    if (allBets.length > 0 && onChainMarkets.length === 0) {
      recommendations.push('No markets deployed on-chain. Use Admin panel to create markets.');
    }
    
    // 3. LP Offers Check
    console.log('[Test] Checking LP offers...');
    const allOffers = await serviceRole.entities.BetOffer.list();
    const activeOffers = allOffers.filter(o => 
      o.status === 'open' || o.status === 'partially_matched'
    );
    
    results.lpProvision = {
      status: activeOffers.length > 0 ? 'PASSED' : 'WARNING',
      totalOffers: allOffers.length,
      activeOffers: activeOffers.length,
      totalLiquidity: activeOffers.reduce((sum, o) => sum + (o.amount_unmatched || 0), 0),
    };
    
    if (activeOffers.length === 0) {
      recommendations.push('No active LP offers. Liquidity providers should add liquidity.');
    }
    
    // 4. Betting Flow Check
    console.log('[Test] Checking betting activity...');
    const allUserBets = await serviceRole.entities.UserBet.list();
    const activeBets = allUserBets.filter(ub => ub.status === 'active' || ub.status === 'pending');
    const wonBets = allUserBets.filter(ub => ub.status === 'won');
    const unclaimedBets = wonBets.filter(ub => !ub.actual_payout);
    
    results.betting = {
      status: 'PASSED',
      totalBets: allUserBets.length,
      activeBets: activeBets.length,
      wonBets: wonBets.length,
      unclaimedBets: unclaimedBets.length,
    };
    
    // 5. Claims Check
    console.log('[Test] Checking claims...');
    results.claims = {
      status: unclaimedBets.length === 0 ? 'PASSED' : 'WARNING',
      unclaimedCount: unclaimedBets.length,
      unclaimedValue: unclaimedBets.reduce((sum, b) => sum + (b.potential_payout || 0), 0),
    };
    
    if (unclaimedBets.length > 0) {
      recommendations.push(`${unclaimedBets.length} winning bets need to be claimed`);
    }
    
    // 6. Wallet Auth Check
    console.log('[Test] Checking wallet authentication...');
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const allUsers = await serviceRole.entities.User.list();
    const usersWithWallet = allUsers.filter(u => u.wallet_address);
    
    results.walletAuth = {
      status: usersWithWallet.length > 0 ? 'PASSED' : 'WARNING',
      totalUsers: allUsers.length,
      usersWithWallet: usersWithWallet.length,
      walletUsers: allWalletUsers.length,
    };
    
    // Overall status
    const allPassed = Object.values(results).every(r => r.status === 'PASSED');
    
    return Response.json({
      success: allPassed,
      timestamp: new Date().toISOString(),
      results,
      recommendations,
      summary: {
        totalTests: Object.keys(results).length,
        passed: Object.values(results).filter(r => r.status === 'PASSED').length,
        warnings: Object.values(results).filter(r => r.status === 'WARNING').length,
        failed: Object.values(results).filter(r => r.status === 'FAILED').length,
      },
    });
    
  } catch (error) {
    console.error('comprehensivePlatformTest error:', error);
    return Response.json({ 
      success: false, 
      error: error.message,
      results: { error: { status: 'FAILED', message: error.message } }
    }, { status: 500 });
  }
});