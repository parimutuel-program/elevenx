import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Test LP Fee Sharing System
 * 
 * Creates a complete test scenario to verify LP fee bonus calculation:
 * 1. Creates a test match and bet market
 * 2. LP provides liquidity on one outcome
 * 3. Regular users bet on the opposing outcome (creating losing pool)
 * 4. Simulates market settlement
 * 5. Calculates expected LP fee bonus
 * 
 * Admin only function for testing purposes.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only - admin role required' }, { status: 403 });
    }

    console.log('[testLpFeeSharing] Starting LP fee sharing test scenario...');

    // Step 1: Create a test match
    const testMatch = await serviceRole.entities.Match.create({
      team_a: 'Test Team A',
      team_b: 'Test Team B',
      team_a_flag: '🇺🇸',
      team_b_flag: '🇧🇷',
      group_stage: 'Test Group',
      match_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      match_end_time: new Date(Date.now() + 90000000).toISOString(),
      venue: 'Test Stadium',
      status: 'upcoming',
    });

    console.log('[testLpFeeSharing] Created test match:', testMatch.id);

    // Step 2: Create a test bet market
    const testBet = await serviceRole.entities.Bet.create({
      match_id: testMatch.id,
      title: 'Test Market - Winner',
      outcome_a: 'Test Team A',
      outcome_b: 'Test Team B',
      outcome_draw: 'Draw',
      open_until: new Date(Date.now() + 86400000).toISOString(),
      status: 'open',
      odds_a: 2.0,
      odds_b: 2.0,
      odds_draw: 3.0,
      odds_bookmaker: 'Test',
      odds_updated_at: new Date().toISOString(),
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      total_pool: 0,
      fee_percent: 500, // 5% in basis points
      total_bettors: 0,
    });

    console.log('[testLpFeeSharing] Created test bet:', testBet.id);

    // Step 3: LP provides liquidity on Team A (10 SOL)
    const lpWalletAddress = 'TestLPWallet123456789ABCDEFGH'; // Test wallet
    const lpOffer = await serviceRole.entities.BetOffer.create({
      bet_id: testBet.id,
      match_id: testMatch.id,
      outcome: 'a', // Backing Team A
      outcome_label: 'Test Team A',
      amount_offered: 10, // 10 SOL liquidity
      amount_matched: 0,
      amount_unmatched: 10,
      status: 'open',
      odds_at_creation: 2.0,
      lp_wallet_address: lpWalletAddress,
    });

    console.log('[testLpFeeSharing] LP provided 10 SOL liquidity:', lpOffer.id);

    // Create UserBet for LP
    const lpUserBet = await serviceRole.entities.UserBet.create({
      bet_id: testBet.id,
      match_id: testMatch.id,
      offer_id: lpOffer.id,
      role: 'lp', // Explicit LP
      outcome: 'a',
      amount: 10,
      potential_payout: 20, // 10 * 2.0 odds
      status: 'active',
      outcome_label: 'Test Team A',
      match_title: 'Test Team A vs Test Team B',
      wallet_address: lpWalletAddress,
    });

    console.log('[testLpFeeSharing] Created LP UserBet:', lpUserBet.id);

    // Step 4: Regular bettors match on Team B (creating losing pool of 15 SOL)
    const bettor1Wallet = 'Bettor1Wallet123456789ABCDEFGH';
    const bettor2Wallet = 'Bettor2Wallet123456789ABCDEFGH';
    const bettor3Wallet = 'Bettor3Wallet123456789ABCDEFGH';

    const bettor1Bet = await serviceRole.entities.UserBet.create({
      bet_id: testBet.id,
      match_id: testMatch.id,
      offer_id: lpOffer.id,
      role: 'matcher',
      outcome: 'b', // Backing Team B (opposing LP)
      amount: 5, // 5 SOL
      potential_payout: 10,
      status: 'active',
      outcome_label: 'Test Team B',
      match_title: 'Test Team A vs Test Team B',
      wallet_address: bettor1Wallet,
    });

    const bettor2Bet = await serviceRole.entities.UserBet.create({
      bet_id: testBet.id,
      match_id: testMatch.id,
      offer_id: lpOffer.id,
      role: 'matcher',
      outcome: 'b',
      amount: 7, // 7 SOL
      potential_payout: 14,
      status: 'active',
      outcome_label: 'Test Team B',
      match_title: 'Test Team A vs Test Team B',
      wallet_address: bettor2Wallet,
    });

    const bettor3Bet = await serviceRole.entities.UserBet.create({
      bet_id: testBet.id,
      match_id: testMatch.id,
      offer_id: lpOffer.id,
      role: 'matcher',
      outcome: 'b',
      amount: 3, // 3 SOL
      potential_payout: 6,
      status: 'active',
      outcome_label: 'Test Team B',
      match_title: 'Test Team A vs Test Team B',
      wallet_address: bettor3Wallet,
    });

    console.log('[testLpFeeSharing] Created 3 matching bets on Team B (total: 15 SOL)');

    // Update LP offer to reflect matching
    await serviceRole.entities.BetOffer.update(lpOffer.id, {
      amount_matched: 15, // Fully matched + overmatched
      amount_unmatched: 0,
      status: 'fully_matched',
    });

    // Update bet pools
    await serviceRole.entities.Bet.update(testBet.id, {
      pool_a: 10,
      pool_b: 15,
      total_pool: 25,
      total_bettors: 4,
    });

    console.log('[testLpFeeSharing] Updated bet pools: A=10 SOL, B=15 SOL');

    // Step 5: Simulate market settlement (Team A wins)
    await serviceRole.entities.Bet.update(testBet.id, {
      status: 'settled',
      winning_outcome: 'a', // Team A wins (LP's side)
    });

    await serviceRole.entities.Match.update(testMatch.id, {
      status: 'finished',
      winner: 'team_a',
      score_a: 3,
      score_b: 1,
    });

    // Update UserBet statuses
    await serviceRole.entities.UserBet.update(lpUserBet.id, {
      status: 'won',
      actual_payout: 20,
    });

    await serviceRole.entities.UserBet.update(bettor1Bet.id, { status: 'lost' });
    await serviceRole.entities.UserBet.update(bettor2Bet.id, { status: 'lost' });
    await serviceRole.entities.UserBet.update(bettor3Bet.id, { status: 'lost' });

    console.log('[testLpFeeSharing] Market settled - Team A wins!');

    // Step 6: Calculate LP fee bonus (what withdrawLpWinnings will do)
    const totalLosingPool = 5 + 7 + 3; // 15 SOL from bettors on Team B
    const feePercent = 0.05; // 5%
    const totalPlatformFee = totalLosingPool * feePercent; // 0.75 SOL
    const lpIncentivePool = totalPlatformFee * 0.5; // 0.375 SOL (50% to LPs)
    
    // Only one LP on winning side, so they get 100% of incentive
    const lpShare = 1.0; // 10 SOL / 10 SOL total LP liquidity
    const lpBonus = lpIncentivePool * lpShare; // 0.375 SOL
    
    const baseWinnings = 15; // LP wins the entire losing pool (15 SOL)
    const totalExpectedWithdraw = baseWinnings + lpBonus; // 15.375 SOL

    console.log('[testLpFeeSharing] LP Fee Bonus Calculation:', {
      totalLosingPool,
      totalPlatformFee,
      lpIncentivePool,
      lpShare,
      lpBonus,
      baseWinnings,
      totalExpectedWithdraw,
    });

    return Response.json({
      success: true,
      message: 'Test scenario created successfully! LP can now withdraw with fee bonus.',
      testData: {
        matchId: testMatch.id,
        betId: testBet.id,
        lpOfferId: lpOffer.id,
        lpUserBetId: lpUserBet.id,
        lpStake: 10,
        totalLosingPool,
        platformFee: totalPlatformFee,
        lpIncentivePool,
        lpBonus,
        baseWinnings,
        expectedTotalWithdraw: totalExpectedWithdraw,
      },
      instructions: {
        step1: 'Go to /lp (LP Dashboard)',
        step2: 'Find "Test Team A vs Test Team B" position',
        step3: 'Click "Withdraw" button',
        step4: 'Sign the Solana transaction',
        step5: 'Verify withdrawal includes ◎0.375 LP fee bonus',
      },
    });

  } catch (error) {
    console.error('[testLpFeeSharing] Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});