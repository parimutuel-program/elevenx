import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * refund instruction builder (for bettors on voided markets)
 * Discriminator: SHA256("global:refund").slice(0, 8)
 * Data: discriminator + outcome (u8)
 * Accounts: market (writable), bet_position (writable), bettor (signer, writable), system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const { programIdStr, programId, connection } = getSolanaConfig();

    const { userBetId, walletAddress } = await req.json();

    if (!walletAddress) {
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    // Fetch UserBet
    const userBets = await serviceRole.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) {
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    // Fetch Bet entity
    const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) {
      return Response.json({ error: 'Bet entity not found' }, { status: 404 });
    }

    // Check market is voided
    if (bet.status !== 'void') {
      return Response.json({ error: 'Market not voided yet' }, { status: 400 });
    }

    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;

    const bettorPubkey = new PublicKey(walletAddress);
    
    // Derive market PDA
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketIdBytes], programId);

    // Verify market exists on-chain
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      return Response.json({ error: 'Market not found on-chain', marketPda: marketPda.toBase58() }, { status: 400 });
    }

    // Verify market is voided on-chain (byte 277)
    const isVoided = marketInfo.data.length > 277 && marketInfo.data[277] === 1;
    if (!isVoided) {
      return Response.json({ error: 'Market not voided on-chain' }, { status: 400 });
    }

    // Derive bet_position PDA: seeds ["position", marketPda, bettorWallet, [outcome]]
    const [betPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    // Build instruction data: discriminator + outcome (u8)
    const discriminator = Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]);
    const instructionData = Buffer.alloc(9);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);

    console.log('[refund] programId:', programIdStr);
    console.log('[refund] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[refund] Accounts:', {
      market: marketPda.toBase58(),
      position: betPositionPda.toBase58(),
      bettor: walletAddress,
    });

    // Accounts: market (writable), bet_position (writable), bettor (signer, writable), system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: betPositionPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    const refundAmount = userBet.amount || 0;
    const refundLamports = Math.round(refundAmount * 1_000_000_000);

    return Response.json({
      success: true,
      message: `Ready to claim refund of ◎${refundAmount.toFixed(4)} SOL`,
      userBetId,
      refundAmount,
      solana_instruction: {
        instruction_type: 'claim_refund',
        programId: programIdStr,
        keys,
        instruction_data: instructionData.toString('base64'),
        amountLamports: refundLamports,
      },
    });

  } catch (error) {
    console.error('[refund] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});