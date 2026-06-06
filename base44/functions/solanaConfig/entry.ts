import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const payload = await req.json();
    const { action, newProgramId } = payload;

    if (action === 'update_program_id') {
      if (!newProgramId || typeof newProgramId !== 'string') {
        return Response.json({ error: 'newProgramId is required' }, { status: 400 });
      }

      // Validate Solana address format
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!base58Regex.test(newProgramId.trim())) {
        return Response.json({ 
          error: 'Invalid Solana address format. Must be 32-44 base58 characters.' 
        }, { status: 400 });
      }

      const oldProgramId = Deno.env.get('SOLANA__PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm';
      const trimmedNewId = newProgramId.trim();

      // Update the secret
      await base44.asServiceRole.secrets.set({
        SOLANA__PROGRAM_ID: trimmedNewId
      });

      console.log(`Program ID updated: ${oldProgramId.slice(0, 8)}... -> ${trimmedNewId.slice(0, 8)}...`);

      return Response.json({
        success: true,
        oldProgramId: oldProgramId,
        newProgramId: trimmedNewId,
        message: 'Program ID updated successfully. Reload the page to apply changes.',
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('solanaConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});