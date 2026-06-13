import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

/**
 * Derive the lp_offer PDA for a given market, LP wallet, and outcome.
 * PDA seeds: ["lp_offer", marketPda, lpWallet, [outcome]]
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { market_pda, lp_wallet, outcome } = await req.json();

    if (!market_pda || !lp_wallet || outcome === undefined) {
      return Response.json({ error: 'Missing market_pda, lp_wallet, or outcome' }, { status: 400 });
    }

    const programId = Deno.env.get('ELEVENX_PROGRAM_ID');
    if (!programId) {
      return Response.json({ error: 'ELEVENX_PROGRAM_ID not configured' }, { status: 500 });
    }

    // Derive PDA: seeds = ["lp_offer", marketPda (32 bytes), lpWallet (32 bytes), [outcome (1 byte)]]
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("lp_offer"),
        new PublicKey(market_pda).toBuffer(),
        new PublicKey(lp_wallet).toBuffer(),
        Buffer.from([outcome]),
      ],
      new PublicKey(programId)
    );

    return Response.json({ pda: pda.toBase58() });
  } catch (error) {
    console.error('[deriveLpOfferPda] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});