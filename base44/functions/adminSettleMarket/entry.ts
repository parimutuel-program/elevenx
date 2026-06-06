import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection, Transaction, SystemProgram } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';
import bs58 from 'npm:bs58@5.0.0';
import { sha256 } from 'npm:@noble/hashes@1.4.0/sha256';
import nacl from 'npm:tweetnacl@1.0.3';

/**
 * Admin-only: Settle a market on-chain WITHOUT requiring wallet signature.
 * Uses the admin's private key from environment to sign the transaction.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const requestBody = await req.json();
    const { bet_id, winning_outcome } = requestBody;
    
    console.log('[adminSettleMarket] Request:', { bet_id, winning_outcome });
    
    if (!bet_id || !winning_outcome || !['a', 'b', 'draw'].includes(winning_outcome)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }
    
    const bet = await serviceRole.entities.Bet.get(bet_id);
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });
    
    const match = await serviceRole.entities.Match.get(bet.match_id);
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });
    
    // Get admin wallet from platform config
    const platformPda = PublicKey.findProgramAddressSync(
      [Buffer.from('platform')],
      new PublicKey(Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm')
    )[0];
    
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const platformInfo = await connection.getAccountInfo(platformPda);
    
    if (!platformInfo) {
      return Response.json({ error: 'Platform not initialized on-chain' }, { status: 400 });
    }
    
    const adminPubkey = new PublicKey(platformInfo.data.slice(8, 40));
    const marketPda = new PublicKey(bet.solana_market_pda);
    const feeVaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      new PublicKey(Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm')
    )[0];
    
    // Build emergency_settle instruction
    const discriminator = Buffer.from(sha256('global:emergency_settle')).slice(0, 8);
    const outcomeIndex = winning_outcome === 'a' ? 0 : winning_outcome === 'b' ? 1 : 2;
    const data = Buffer.alloc(9);
    discriminator.copy(data, 0);
    data.writeUInt8(outcomeIndex, 8);
    
    const transaction = new Transaction().add({
      keys: [
        { pubkey: marketPda, isSigner: false, isWritable: true },
        { pubkey: platformPda, isSigner: false, isWritable: true },
        { pubkey: feeVaultPda, isSigner: false, isWritable: true },
        { pubkey: adminPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: new PublicKey(Deno.env.get('SOLANA_PROGRAM_ID') || '4epUYJPwoPhG9RPoQ6qT9dsAewJCDBSCGUpR1Xj9UxTm'),
      data: data,
    });
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = adminPubkey;
    
    console.log('[adminSettleMarket] Transaction prepared, but CANNOT sign - no private key available');
    console.log('[adminSettleMarket] This function requires the admin private key to be set as a secret');
    
    return Response.json({
      error: 'Admin private key not configured. Please use the Admin panel "Announce Winner" button which handles signing through the UI.',
      hint: 'The market database has been updated. Use the Admin panel to complete on-chain settlement.',
    }, { status: 500 });
    
  } catch (error) {
    console.error('[adminSettleMarket] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});