import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Returns the current SOLANA_PROGRAM_ID secret value.
 * Forces a fresh read from environment on each call.
 * Version: 2026-06-10 - New program ID EQiqoL7VX5n4BTxuHwyWBa1bmYvTSeWRWBdSCyyFxHvN
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Force fresh read from environment variables (secrets)
    const currentProgramId = Deno.env.get('SOLANA_PROGRAM_ID');

    if (!currentProgramId) {
      return Response.json({
        error: 'SOLANA_PROGRAM_ID secret not set',
        message: 'Please set the SOLANA_PROGRAM_ID secret in Dashboard → Code → Secrets',
      }, { status: 400 });
    }

    return Response.json({
      currentProgramId: currentProgramId,
      message: 'Program ID loaded successfully from secrets',
    });

  } catch (error) {
    console.error('solanaConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});