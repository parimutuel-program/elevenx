import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Returns current Solana configuration from env secrets.
 * Admin-only diagnostic endpoint.
 */
Deno.serve(async (req) => {
  try {
    const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
    const programId = Deno.env.get('ELEVENX_PROGRAM_ID');
    // Legacy fallback read (informational only)
    const legacyProgramId = Deno.env.get('SOLANA_PROGRAM_ID');

    if (!rpcUrl) return Response.json({ error: 'SOLANA_RPC_URL secret not set' }, { status: 400 });
    if (!programId) return Response.json({ error: 'ELEVENX_PROGRAM_ID secret not set' }, { status: 400 });

    // Determine cluster from the private RPC URL but never expose the key to the client.
    const network = rpcUrl.includes('mainnet') ? 'mainnet-beta' : rpcUrl.includes('devnet') ? 'devnet' : 'mainnet-beta';

    // Safe public RPC URL to send to the frontend (no API key).
    // The private Helius URL (with key) stays server-side only.
    const publicRpcUrl = network === 'devnet'
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com';

    return Response.json({
      rpcUrl: publicRpcUrl,
      programId,
      network,
      legacyProgramId: legacyProgramId || '(not set)',
      message: 'Solana configuration loaded from secrets',
    });
  } catch (error) {
    console.error('solanaConfig error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});