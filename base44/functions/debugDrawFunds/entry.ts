import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceRole = base44.asServiceRole;
    
    // Get all settled Bets to find which ones ended in draws
    const allBets = await serviceRole.entities.Bet.list();
    const drawBets = allBets.filter(b => b.winning_outcome === 'draw' || b.winning_outcome === '');
    
    console.log('[debugDrawFunds] Total Bets:', allBets.length);
    console.log('[debugDrawFunds] Potential Draw Bets:', drawBets.length);
    
    // Get all UserBets
    const allUserBets = await serviceRole.entities.UserBet.list();
    
    // Find UserBets for draw matches
    const drawUserBets = [];
    const otherUserBets = [];
    
    for (const userBet of allUserBets) {
      const bet = drawBets.find(b => b.id === userBet.bet_id || b.match_id === userBet.match_id);
      if (bet) {
        drawUserBets.push({
          ...userBet,
          bet_title: bet.title || bet.outcome_a + ' vs ' + bet.outcome_b,
          match_id: userBet.match_id,
          bet_id: userBet.bet_id,
        });
      } else {
        otherUserBets.push(userBet);
      }
    }
    
    console.log('[debugDrawFunds] UserBets in draw matches:', drawUserBets.length);
    
    // Analyze LP positions in draw matches
    const lpInDraws = drawUserBets.filter(ub => ub.role === 'lp');
    const bettorsInDraws = drawUserBets.filter(ub => ub.role === 'matcher');
    
    console.log('[debugDrawFunds] LP positions in draws:', lpInDraws.length);
    console.log('[debugDrawFunds] Bettors in draws:', bettorsInDraws.length);
    
    // Check how many LPs were marked as 'won' (incorrectly)
    const lpWonIncorrectly = lpInDraws.filter(ub => ub.status === 'won' || ub.status === 'claimed');
    const lpLost = lpInDraws.filter(ub => ub.status === 'lost');
    const lpActive = lpInDraws.filter(ub => ub.status === 'active' || ub.status === 'pending');
    
    console.log('[debugDrawFunds] LPs incorrectly marked as WON:', lpWonIncorrectly.length);
    console.log('[debugDrawFunds] LPs correctly marked as LOST:', lpLost.length);
    console.log('[debugDrawFunds] LPs still ACTIVE/PENDING:', lpActive.length);
    
    // Calculate total funds at stake
    const totalLpMatchedIncorrectly = lpWonIncorrectly.reduce((sum, ub) => sum + (ub.liquidity_matched || ub.amount || 0), 0);
    const totalLpMatchedLost = lpLost.reduce((sum, ub) => sum + (ub.liquidity_matched || ub.amount || 0), 0);
    
    console.log('[debugDrawFunds] Total LP matched liquidity (incorrectly won):', totalLpMatchedIncorrectly, 'SOL');
    console.log('[debugDrawFunds] Total LP matched liquidity (correctly lost):', totalLpMatchedLost, 'SOL');
    
    // Check if any LPs already claimed (this is the problem!)
    const lpAlreadyClaimed = lpWonIncorrectly.filter(ub => ub.status === 'claimed');
    const totalClaimedIncorrectly = lpAlreadyClaimed.reduce((sum, ub) => sum + (ub.actual_payout || 0), 0);
    
    console.log('[debugDrawFunds] LPs who already CLAIMED incorrectly:', lpAlreadyClaimed.length);
    console.log('[debugDrawFunds] Total SOL claimed incorrectly:', totalClaimedIncorrectly, 'SOL');
    
    return Response.json({
      summary: {
        totalBets: allBets.length,
        drawBets: drawBets.length,
        totalUserBets: allUserBets.length,
        userBetsInDraws: drawUserBets.length,
      },
      lpAnalysis: {
        totalLpInDraws: lpInDraws.length,
        lpWonIncorrectly: lpWonIncorrectly.length,
        lpLost: lpLost.length,
        lpActive: lpActive.length,
        totalLpMatchedIncorrectly,
        totalLpMatchedLost,
      },
      fundsAtStake: {
        lpAlreadyClaimed: lpAlreadyClaimed.length,
        totalClaimedIncorrectly,
        totalLpMatchedAtStake: totalLpMatchedIncorrectly,
      },
      drawBetsDetails: drawBets.map(b => ({
        id: b.id,
        title: b.title || b.outcome_a + ' vs ' + b.outcome_b,
        match_id: b.match_id,
        winning_outcome: b.winning_outcome,
        status: b.status,
        pool_a: b.pool_a || 0,
        pool_b: b.pool_b || 0,
        pool_draw: b.pool_draw || 0,
        total_pool: b.total_pool || 0,
      })),
      lpWonIncorrectlyDetails: lpWonIncorrectly.map(ub => ({
        id: ub.id,
        bet_id: ub.bet_id,
        match_id: ub.match_id,
        outcome: ub.outcome,
        outcome_label: ub.outcome_label,
        role: ub.role,
        status: ub.status,
        liquidity_matched: ub.liquidity_matched || ub.amount || 0,
        actual_payout: ub.actual_payout || 0,
        wallet_address: ub.wallet_address,
      })),
      lpAlreadyClaimedDetails: lpAlreadyClaimed.map(ub => ({
        id: ub.id,
        bet_id: ub.bet_id,
        match_id: ub.match_id,
        outcome: ub.outcome,
        liquidity_matched: ub.liquidity_matched || ub.amount || 0,
        actual_payout: ub.actual_payout || 0,
        wallet_address: ub.wallet_address,
      })),
    });
    
  } catch (error) {
    console.error('[debugDrawFunds] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});