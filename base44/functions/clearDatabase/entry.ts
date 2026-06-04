import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[clearDatabase] Starting database cleanup...');

    let deletedCount = 0;

    const deleteAll = async (entityType, delayMs = 150) => {
      let count = 0;
      console.log(`[clearDatabase] Fetching ${entityType}...`);
      const records = await base44.asServiceRole.entities[entityType].list('-created_date', 1000);
      
      for (const r of records) {
        try {
          await base44.asServiceRole.entities[entityType].delete(r.id);
          count++;
          deletedCount++;
          if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (err) {
          if (err.status === 429) {
            console.log(`[clearDatabase] Rate limited, waiting 3s...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            await base44.asServiceRole.entities[entityType].delete(r.id);
            count++;
            deletedCount++;
          } else if (err.status !== 404) {
            console.warn(`[clearDatabase] Error deleting ${r.id}:`, err.message);
          }
        }
      }
      
      console.log(`[clearDatabase] Deleted ${count} ${entityType}`);
      return count;
    };

    await deleteAll('UserBets', 100);
    await deleteAll('BetOffers', 100);
    await deleteAll('LpPositions', 100);
    await deleteAll('Bets', 150);
    await deleteAll('FuturesMarkets', 100);
    await deleteAll('Matches', 150);

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