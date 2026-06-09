import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

/**
 * Admin-only: Sweep SOL from a settled market account to admin wallet.
 * Use this when funds are stuck in a market account after settlement.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const payload = await req.json();
    const marketPda = payload.market_pda;
    const adminWallet = payload.admin_wallet;

    if (!marketPda || !adminWallet) {
      return Response.json({ 
        error: 'Missing market_pda or admin_wallet',
        received: payload 
      }, { status: 400 });
    }

    const programId = new PublicKey(Deno.env.get('SOLANA_PROGRAM_ID'));
    const marketPubkey = new PublicKey(marketPda);
    const adminPubkey = new PublicKey(adminWallet);

    console.log('[sweepMarketFunds] Preparing sweep:', {
      marketPda: marketPubkey.toBase58(),
      adminWallet: adminPubkey.toBase58(),
      programId: programId.toBase58(),
    });

    // Simple transfer instruction - transfer ALL lamports from market to admin
    // This is a system-level transfer, not a program instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: marketPubkey,
      toPubkey: adminPubkey,
      lamports: 42623920, // Will be replaced with actual balance by frontend
    });

    return Response.json({
      success: true,
      message: 'Sign to sweep funds from market account',
      solana_instruction: {
        instruction_type: 'sweep_market_funds',
        programId: SystemProgram.programId.toBase58(),
        instruction_data: transferInstruction.data.toString('base64'),
        keys: [
          { pubkey: marketPubkey.toBase58(), isSigner: false, isWritable: true },
          { pubkey: adminPubkey.toBase58(), isSigner: false, isWritable: true },
        ]
      },
      note: 'Frontend must fetch actual market balance and update lamports before signing'
    });
  } catch (error) {
    console.error('[sweepMarketFunds] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});