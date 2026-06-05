import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Complete Parimutuel Betting Flow Test (A-Z)
 * 
 * Tests the full flow where bettors bet directly into pending pool (no LP needed):
 * 1. Creates a test match and bet market
 * 2. Multiple bettors place bets on different outcomes (parimutuel mode)
 * 3. Market settles with a winner
 * 4. Winners claim their parimutuel pool share
 * 5. Losers claim refunds
 * 
 * This tests the "under-the-hood LP" model where all bettors contribute to pools.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only - admin role required' }, { status: 403 });
    }

    console.log('[testParimutuelFlow] Starting complete parimutuel flow test...');

    // Step 1: Create a test match (World Cup Final)
    const testMatch = await serviceRole.entities.Match.create({
      team_a: 'Argentina',
      team_b: 'France',
      team_a_flag: '🇦🇷',
      team_b_flag: '🇫🇷',
      group_stage: 'Final',
      match_time: new Date(Date.now() + 86400000).toISOString(),
      match_end_time: new Date(Date.now() + 90000000).toISOString(),
      venue: 'Lusail Stadium',
      status: 'upcoming',
    });
    console.log('✅ Created match:', testMatch.id);

    // Step 2: Create a bet market (parimutuel - no fixed odds)
    const testBet = await serviceRole.entities.Bet.create({
      match_id: testMatch.id,
      title: 'World Cup Final - Winner',
      outcome_a: 'Argentina',
      outcome_b: 'France',
      outcome_draw: 'Draw (90 min)',
      open_until: new Date(Date.now() + 86400000).toISOString(),
      status: 'open',
      odds_a: 0,
      odds_b: 0,
      odds_draw: 0,
      odds_bookmaker: 'Parimutuel',
      odds_updated_at: new Date().toISOString(),
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      total_pool: 0,
      fee_percent: 500, // 5%
      total_bettors: 0,
      solana_market_created: false,
    });
    console.log('✅ Created bet market:', testBet.id);

    // Step 3: Multiple users place bets (parimutuel mode - no LP offers)
    const bettors = [
      { wallet: 'Bettor1_Argentina_Fan', outcome: 'a', amount: 3, label: 'Argentina' },
      { wallet: 'Bettor2_Messi_GOAT', outcome: 'a', amount: 5, label: 'Argentina' },
      { wallet: 'Bettor3_France_Supporter', outcome: 'b', amount: 4, label: 'France' },
      { wallet: 'Bettor4_Mbappe_Fan', outcome: 'b', amount: 3, label: 'France' },
      { wallet: 'Bettor5_Cautious_Better', outcome: 'draw', amount: 2, label: 'Draw' },
      { wallet: 'Bettor6_Draw_Hunter', outcome: 'draw', amount: 3, label: 'Draw' },
    ];

    const userBets = [];
    for (const bettor of bettors) {
      const userBet = await serviceRole.entities.UserBet.create({
        bet_id: testBet.id,
        match_id: testMatch.id,
        offer_id: null, // Parimutuel - no LP offer
        role: 'matcher',
        outcome: bettor.outcome,
        amount: bettor.amount,
        potential_payout: 0,
        status: 'active',
        outcome_label: bettor.label,
        match_title: 'Argentina vs France (Final)',
        wallet_address: bettor.wallet,
      });
      userBets.push(userBet);
    }
    console.log('✅ Created', userBets.length, 'user bets');

    // Calculate pools
    const poolA = bettors.filter(b => b.outcome === 'a').reduce((sum, b) => sum + b.amount, 0); // 8 SOL
    const poolB = bettors.filter(b => b.outcome === 'b').reduce((sum, b) => sum + b.amount, 0); // 7 SOL
    const poolDraw = bettors.filter(b => b.outcome === 'draw').reduce((sum, b) => sum + b.amount, 0); // 5 SOL
    const totalPool = poolA + poolB + poolDraw; // 20 SOL

    // Update bet with pool totals
    await serviceRole.entities.Bet.update(testBet.id, {
      pool_a: poolA,
      pool_b: poolB,
      pool_draw: poolDraw,
      total_pool: totalPool,
      total_bettors: bettors.length,
    });
    console.log('📊 Pools: Argentina=' + poolA + ', France=' + poolB + ', Draw=' + poolDraw + ' (Total=' + totalPool + ' SOL)');

    // Calculate parimutuel odds (after 5% platform fee)
    const feePercent = 0.05;
    const platformFee = totalPool * feePercent; // 1 SOL
    const distributionPool = totalPool - platformFee; // 19 SOL
    
    const oddsA = distributionPool / poolA; // 2.375
    const oddsB = distributionPool / poolB; // 2.714
    const oddsDraw = distributionPool / poolDraw; // 3.8

    console.log('📈 Parimutuel odds: Argentina=' + oddsA.toFixed(3) + ', France=' + oddsB.toFixed(3) + ', Draw=' + oddsDraw.toFixed(3));

    // Step 4: Settle market (Argentina wins)
    await serviceRole.entities.Match.update(testMatch.id, {
      status: 'finished',
      score_a: 3,
      score_b: 2,
      winner: 'team_a',
    });

    await serviceRole.entities.Bet.update(testBet.id, {
      status: 'settled',
      winning_outcome: 'a',
    });
    console.log('⚽ Market settled: Argentina wins 3-2');

    // Step 5: Update user bet statuses and calculate payouts
    const winningBets = userBets.filter(b => b.outcome === 'a');
    const losingBets = userBets.filter(b => b.outcome !== 'a');

    const withdrawals = [];
    
    // Winners get parimutuel share
    for (const bet of winningBets) {
      const payout = bet.amount * oddsA;
      await serviceRole.entities.UserBet.update(bet.id, {
        status: 'won',
        actual_payout: payout,
      });
      withdrawals.push({
        wallet: bet.wallet_address,
        type: 'winnings',
        stake: bet.amount,
        payout: payout,
        profit: ((payout / bet.amount - 1) * 100).toFixed(1) + '%',
      });
    }

    // Losers get full refund
    for (const bet of losingBets) {
      await serviceRole.entities.UserBet.update(bet.id, {
        status: 'refunded',
        actual_payout: bet.amount,
      });
      withdrawals.push({
        wallet: bet.wallet_address,
        type: 'refund',
        stake: bet.amount,
        refund: bet.amount,
      });
    }
    console.log('💰 Calculated withdrawals for', withdrawals.length, 'bettors');

    return Response.json({
      success: true,
      message: 'Parimutuel betting test scenario created successfully!',
      testData: {
        matchId: testMatch.id,
        betId: testBet.id,
        match: 'Argentina vs France (Final)',
        result: 'Argentina wins 3-2',
        pools: {
          argentina: poolA,
          france: poolB,
          draw: poolDraw,
          total: totalPool,
        },
        parimutuelOdds: {
          argentina: oddsA.toFixed(4),
          france: oddsB.toFixed(4),
          draw: oddsDraw.toFixed(4),
        },
        platformFee: platformFee,
        distributionPool: distributionPool,
        winningOutcome: 'a',
        winningBets: winningBets.map(b => ({
          wallet: b.wallet_address,
          stake: b.amount,
          payout: b.actual_payout,
          profit: ((b.actual_payout / b.amount - 1) * 100).toFixed(1) + '%',
        })),
        losingBets: losingBets.map(b => ({
          wallet: b.wallet_address,
          stake: b.amount,
          refund: b.amount,
        })),
        withdrawals,
      },
      instructions: {
        step1: 'Deploy market on-chain: call createMarketOnChain with betId',
        step2: 'Bettors place bets: call placeBet (no offer_id = parimutuel mode)',
        step3: 'Sign transactions in Phantom wallet',
        step4: 'Commit bets: call commitMatchBet with signatures',
        step5: 'Settle market: call settleBetWithOracle with result',
        step6: 'Winners claim: call claimWinnings',
        step7: 'Losers refund: call claimRefund',
      },
      nextSteps: [
        '1. Deploy market on-chain: call createMarketOnChain with betId=' + testBet.id,
        '2. Bettors place bets via /matches or /bet/' + testBet.id,
        '3. After match ends, admin settles via settleBetWithOracle',
        '4. Winners claim winnings from /my-bets',
        '5. Losers claim refunds from /my-bets',
        '',
        '📊 Expected Results:',
        '  - Argentina bettors (8 SOL) split 19 SOL pool → 2.375x return',
        '  - France/Draw bettors get full refund',
        '  - Platform keeps 1 SOL fee (5% of 20 SOL)',
      ],
    });

  } catch (error) {
    console.error('[testParimutuelFlow] Error:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});