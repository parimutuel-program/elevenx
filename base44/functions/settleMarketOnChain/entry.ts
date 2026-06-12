import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';
import * as ed from 'npm:@noble/ed25519@2.1.0';
import { sha512 } from 'npm:@noble/hashes@1.4.0/sha512';

const ORACLE_PUBKEY = 'TANKr3X5h45271pGw2GxGoaeHXZRBXHwr1AAvcAop2G';
const ED25519_PROGRAM = 'Ed25519SigVerify111111111111111111111111111111';
const INSTRUCTIONS_SYSVAR = 'Sysvar1nstructions1111111111111111111111111111';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

async function anchorDiscriminator(name) {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}

function buildEd25519InstructionData(signatureBytes, pubkeyBytes, messageBytes) {
  const HEADER_SIZE = 16;
  const sigOffset    = HEADER_SIZE;
  const pubkeyOffset = sigOffset + 64;
  const msgOffset    = pubkeyOffset + 32;
  const msgSize      = messageBytes.length;

  const data = Buffer.alloc(msgOffset + msgSize);
  data.writeUInt8(1, 0);
  data.writeUInt8(0, 1);
  data.writeUInt16LE(sigOffset, 2);
  data.writeUInt16LE(0xffff, 4);
  data.writeUInt16LE(pubkeyOffset, 6);
  data.writeUInt16LE(0xffff, 8);
  data.writeUInt16LE(msgOffset, 10);
  data.writeUInt16LE(msgSize, 12);
  data.writeUInt16LE(0xffff, 14);
  signatureBytes.copy(data, sigOffset);
  pubkeyBytes.copy(data, pubkeyOffset);
  messageBytes.copy(data, msgOffset);
  return data;
}

/** Sign message bytes using the oracle Ed25519 private key stored as a secret. */
async function signWithOracleKey(messageBytes) {
  const oraclePrivKeyRaw = Deno.env.get('ORACLE_PRIVATE_KEY');
  if (!oraclePrivKeyRaw) throw new Error('ORACLE_PRIVATE_KEY secret not set');

  // Accept base58-encoded 64-byte keypair (Solana keypair format) or 32-byte seed
  const decoded = bs58.decode(oraclePrivKeyRaw.trim());
  
  // Solana keypairs are 64 bytes: first 32 = seed, last 32 = pubkey
  // SubtleCrypto importKey for Ed25519 expects the 32-byte raw seed
  const seedBytes = decoded.length === 64 ? decoded.slice(0, 32) : decoded;
  
  const privateKey = await crypto.subtle.importKey(
    'raw',
    seedBytes,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    messageBytes,
  );

  return Buffer.from(signatureBuffer);
}

Deno.serve(async (req) => {
  try {
    const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
    const rpcUrl       = Deno.env.get('SOLANA_RPC_URL');
    if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
    if (!rpcUrl)       throw new Error('SOLANA_RPC_URL secret not set');

    const programId = new PublicKey(programIdStr);

    const { market_pda, winning_outcome, admin_wallet } = await req.json();

    const validOutcomes = ['a', 'b', 'draw', 'void'];
    if (!market_pda)     return Response.json({ error: 'market_pda required' }, { status: 400 });
    if (!admin_wallet)   return Response.json({ error: 'admin_wallet required' }, { status: 400 });
    if (!winning_outcome || !validOutcomes.includes(winning_outcome)) {
      return Response.json({ error: 'winning_outcome must be a|b|draw|void' }, { status: 400 });
    }

    const outcomeMap = { a: 0, b: 1, draw: 2 };
    const marketPubkey = new PublicKey(market_pda);
    const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);

    // ── VOID path ─────────────────────────────────────────────────────────────
    if (winning_outcome === 'void') {
      const disc = await anchorDiscriminator('force_void_market');
      return Response.json({
        success: true,
        winning_outcome: 'void',
        message: 'Sign to void market (force_void_market)',
        solana_instruction: {
          instruction_type: 'settle_market',
          programId: programIdStr,
          rpcUrl,
          keys: [
            { pubkey: market_pda,             isSigner: false, isWritable: true  },
            { pubkey: platformPda.toBase58(),  isSigner: false, isWritable: false },
            { pubkey: 'SIGNER_WALLET',         isSigner: true,  isWritable: false },
            { pubkey: SYSTEM_PROGRAM,          isSigner: false, isWritable: false },
          ],
          instruction_data: disc.toString('base64'),
        },
      });
    }

    // ── SETTLE path: sign server-side ─────────────────────────────────────────
    const outcomeU8 = outcomeMap[winning_outcome];

    // Message: market_pubkey(32) || outcome(1)
    const messageBytes = Buffer.alloc(33);
    Buffer.from(marketPubkey.toBytes()).copy(messageBytes, 0);
    messageBytes.writeUInt8(outcomeU8, 32);

    // Sign with oracle key stored in secret
    const signatureBytes = await signWithOracleKey(messageBytes);
    console.log('[settleMarketOnChain] Oracle signed outcome', outcomeU8, 'for market', market_pda);

    const oraclePubkeyBytes = Buffer.from(new PublicKey(ORACLE_PUBKEY).toBytes());

    // Ix 0: Ed25519SigVerify
    const ed25519Data = buildEd25519InstructionData(signatureBytes, oraclePubkeyBytes, messageBytes);
    const ix0 = {
      programId: ED25519_PROGRAM,
      keys: [],
      instruction_data: ed25519Data.toString('base64'),
    };

    // Ix 1: settle_with_attestation
    const disc = await anchorDiscriminator('settle_with_attestation');
    const settleData = Buffer.alloc(9);
    disc.copy(settleData, 0);
    settleData.writeUInt8(outcomeU8, 8);

    const ix1 = {
      programId: programIdStr,
      keys: [
        { pubkey: market_pda,              isSigner: false, isWritable: true  },
        { pubkey: feeVaultPda.toBase58(),   isSigner: false, isWritable: true  },
        { pubkey: INSTRUCTIONS_SYSVAR,     isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM,          isSigner: false, isWritable: false },
      ],
      instruction_data: settleData.toString('base64'),
    };

    return Response.json({
      success: true,
      winning_outcome,
      outcome_u8: outcomeU8,
      message: `Oracle signed. Sign tx to settle market (outcome=${outcomeU8})`,
      solana_instruction: {
        instruction_type: 'settle_market',
        programId: programIdStr,
        rpcUrl,
        instructions: [ix0, ix1],
      },
    });

  } catch (error) {
    console.error('[settleMarketOnChain] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});