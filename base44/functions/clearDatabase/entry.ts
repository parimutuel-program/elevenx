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
      
      try {
        const records = await base44.asServiceRole.entities[entityType].list('-created_date', 1000);
        
        for (const r of records) {
          try {
            await base44.asServiceRole.entities[entityType].delete(r.id);
            count++;
            deletedCount++;
            if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
          } catch (err) {
            // Handle rate limiting with exponential backoff
            if (err.status === 429) {
              console.log(`[clearDatabase] Rate limited on ${entityType}, waiting 5s...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              try {
                await base44.asServiceRole.entities[entityType].delete(r.id);
                count++;
                deletedCount++;
              } catch (retryErr) {
                if (retryErr.status !== 404) {
                  console.warn(`[clearDatabase] Retry failed for ${r.id}:`, retryErr.message);
                }
              }
            } 
            // Ignore 404 - record already deleted
            else if (err.status !== 404) {
              console.warn(`[clearDatabase] Error deleting ${r.id}:`, err.message);
            }
          }
        }
        
        console.log(`[clearDatabase] Deleted ${count} ${entityType}`);
      } catch (listErr) {
        // Handle case where entity type doesn't exist or is empty
        if (listErr.status === 404 || listErr.message?.includes('not found')) {
          console.log(`[clearDatabase] ${entityType} entity not found or empty, skipping...`);
          return 0;
        }
        throw listErr;
      }
      
      return count;
    };

    await deleteAll('UserBet', 100);
    await deleteAll('BetOffer', 100);
    await deleteAll('LpPosition', 100);
    await deleteAll('Bet', 150);
    await deleteAll('FuturesMarket', 100);
    await deleteAll('Match', 150);

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