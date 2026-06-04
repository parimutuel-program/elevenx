import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[clearDatabase] Starting database cleanup...');

    const safeDelete = async (entityType, id, delayMs = 100) => {
      let retries = 5;
      while (retries > 0) {
        try {
          await base44.asServiceRole.entities[entityType].delete(id);
          if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
          return;
        } catch (err) {
          if (err.status === 429) {
            retries--;
            if (retries === 0) throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else if (err.status !== 404) {
            throw err;
          }
        }
      }
    };

    let deletedCount = 0;

    console.log('[clearDatabase] Deleting UserBets...');
    const userBets = await base44.asServiceRole.entities.UserBet.list();
    for (const ub of userBets) { await safeDelete('UserBet', ub.id, 50); deletedCount++; }
    
    console.log('[clearDatabase] Deleting BetOffers...');
    const betOffers = await base44.asServiceRole.entities.BetOffer.list();
    for (const bo of betOffers) { await safeDelete('BetOffer', bo.id, 50); deletedCount++; }
    
    console.log('[clearDatabase] Deleting LpPositions...');
    const lpPositions = await base44.asServiceRole.entities.LpPosition.list();
    for (const lp of lpPositions) { await safeDelete('LpPosition', lp.id, 50); deletedCount++; }
    
    console.log('[clearDatabase] Deleting Bets...');
    const bets = await base44.asServiceRole.entities.Bet.list();
    for (const bet of bets) { await safeDelete('Bet', bet.id, 80); deletedCount++; }
    
    console.log('[clearDatabase] Deleting FuturesMarkets...');
    const futures = await base44.asServiceRole.entities.FuturesMarket.list();
    for (const fm of futures) { await safeDelete('FuturesMarket', fm.id, 50); deletedCount++; }
    
    console.log('[clearDatabase] Deleting Matches...');
    const matches = await base44.asServiceRole.entities.Match.list();
    for (const m of matches) { await safeDelete('Match', m.id, 80); deletedCount++; }

    return Response.json({
      success: true,
      message: `✅ Database cleared! Deleted ${deletedCount} records total.`,
      deletedCount,
    });
    
  } catch (error) {
    console.error('[clearDatabase] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});