import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const currentProgramId = Deno.env.get('SOLANA_PROGRAM_ID') || 'GtqYmsWv3EXdhnkahekABVnoqDhbmjrp7jQLqYxoepyR'; // Cache refresh trigger

    return Response.json({
      currentProgramId: currentProgramId,
      message: 'To update the program ID, go to Dashboard → Code → Secrets and update SOLANA_PROGRAM_ID',
    });

  } catch (error) {
    console.error('solanaConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});