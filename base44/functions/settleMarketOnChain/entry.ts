import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

async function anchorDiscriminator(name) {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * Settle a market on-chain.
 *
 * winning_outcome = 'a' | 'b' | 'draw'  → settle_with_attestation(outcome: u8)
 *   outcome encoding: a=0, b=1, draw=2
 *   accounts: market, fee_vault, admin (signer), system_program
 *
 * winning_outcome = 'void'              → force_void_market
 *   accounts: market, platform_config, admin (signer), system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const { rpcUrl, programIdStr, programId, connection } = getSolanaConfig();

    const { bet_id, winning_outcome, admin_wallet } = await req.json();

    const validOutcomes = ['a', 'b', 'draw', 'void'];
    if (!bet_id || !winning_outcome || !validOutcomes.includes(winning_outcome)) {
      return Response.json({ error: 'Invalid parameters. winning_outcome must be a|b|draw|void' }, { status: 400 });
    }
    if (!admin_wallet) return Response.json({ error: 'Admin wallet address required' }, { status: 400 });

    const bet = await serviceRole.entities.Bet.get(bet_id);
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(bet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(bet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
    const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);

    const platformInfo = await connection.getAccountInfo(platformPda);
    if (!platformInfo) return Response.json({ error: 'Platform config not found on-chain' }, { status: 400 });

    // ── VOID path: force_void_market ──────────────────────────────────────────
    if (winning_outcome === 'void') {
      const disc = await anchorDiscriminator('force_void_market');
      const keys = [
        { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: platformPda.toBase58(), isSigner: false, isWritable: false },
        { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: false },
        { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
      ];
      return Response.json({
        success: true, bet_id, winning_outcome: 'void',
        message: 'Sign to void market (force_void_market)',
        solana_instruction: {
          instruction_type: 'settle_market',
          programId: programIdStr,
          rpcUrl,
          keys,
          instruction_data: disc.toString('base64'),
        },
      });
    }

    // ── SETTLE path: settle_with_attestation(outcome: u8) ─────────────────────
    // outcome: a=0, b=1, draw=2
    const outcomeMap = { a: 0, b: 1, draw: 2 };
    const outcomeU8 = outcomeMap[winning_outcome];

    const disc = await anchorDiscriminator('settle_with_attestation');

    // instruction data: 8-byte discriminator + 1-byte outcome (u8)
    const data = Buffer.alloc(9);
    disc.copy(data, 0);
    data.writeUInt8(outcomeU8, 8);

    // accounts: market, fee_vault, admin (signer), system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: 'SIGNER_WALLET', isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    const outcomeLabel = winning_outcome === 'a' ? bet.outcome_a : winning_outcome === 'b' ? bet.outcome_b : 'Draw';
    return Response.json({
      success: true, bet_id, winning_outcome,
      message: `Sign to settle: ${outcomeLabel} wins (settle_with_attestation, outcome=${outcomeU8})`,
      solana_instruction: {
        instruction_type: 'settle_market',
        programId: programIdStr,
        rpcUrl,
        keys,
        instruction_data: data.toString('base64'),
      },
    });

  } catch (error) {
    console.error('[settleMarketOnChain] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});