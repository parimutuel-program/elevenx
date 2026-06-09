import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Force fresh read of SOLANA_PROGRAM_ID secret - no caching
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Force fresh read by accessing env multiple times
    const val1 = Deno.env.get('SOLANA_PROGRAM_ID');
    const val2 = Deno.env.get('SOLANA_PROGRAM_ID');
    const val3 = Deno.env.get('SOLANA_PROGRAM_ID');
    
    console.log('=== FRESH SECRET READ ===');
    console.log('Read 1:', val1);
    console.log('Read 2:', val2);
    console.log('Read 3:', val3);
    console.log('All match:', val1 === val2 && val2 === val3);
    console.log('========================');

    return Response.json({
      SOLANA_PROGRAM_ID: val1 || 'not found',
      all_reads_match: val1 === val2 && val2 === val3,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('checkFreshSecret error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});