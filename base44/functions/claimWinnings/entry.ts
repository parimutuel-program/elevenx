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
 * claim_winnings instruction builder
 * Discriminator: [161, 215, 24, 59, 14, 236, 242, 221]
 * Data: discriminator + 1 byte outcome (u8)
 * Accounts: market, bet_position, fee_vault, bettor (signer), system_program
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

    // Fetch Bet or FuturesMarket entity
    let market, isFutures;
    if (userBet.futures_market_id) {
      // Futures bet
      const futuresMarkets = await serviceRole.entities.FuturesMarket.filter({ id: userBet.futures_market_id });
      market = futuresMarkets[0];
      isFutures = true;
      if (!market) {
        return Response.json({ error: 'Futures market not found' }, { status: 404 });
      }
    } else {
      // Match bet
      const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
      market = bets[0];
      isFutures = false;
      if (!market) {
        return Response.json({ error: 'Bet entity not found' }, { status: 404 });
      }
    }

    // Check market is settled
    if (market.status !== 'settled') {
      return Response.json({ error: 'Market not settled yet' }, { status: 400 });
    }

    // Verify this bet won
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    let winningOutcome;
    if (isFutures) {
      // For futures: a=0 (1st), b=1 (2nd), draw=2 (3rd)
      const winningLabel = market.winning_outcome; // "1st", "2nd", or "3rd"
      winningOutcome = winningLabel === '1st' ? 0 : winningLabel === '2nd' ? 1 : 2;
    } else {
      // For matches: a=0, b=1, draw=2
      const winningLabel = market.winning_outcome; // "a", "b", or "draw"
      winningOutcome = winningLabel === 'a' ? 0 : winningLabel === 'b' ? 1 : 2;
    }

    if (outcomeIndex !== winningOutcome) {
      return Response.json({ error: 'This bet did not win' }, { status: 400 });
    }

    const bettorPubkey = new PublicKey(walletAddress);
    
    // Derive market PDA
    const marketId = isFutures ? userBet.futures_market_id : userBet.match_id;
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(marketId, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(marketId.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketIdBytes], programId);

    // Verify market exists on-chain
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      return Response.json({ error: 'Market not found on-chain', marketPda: marketPda.toBase58() }, { status: 400 });
    }

    // Derive bet_position PDA: seeds ["position", marketPda, bettorWallet, [outcome]]
    const [betPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    // Derive fee_vault PDA: seeds ["fee_vault"]
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);

    // Build instruction data: discriminator + outcome (u8)
    const discriminator = Buffer.from([161, 215, 24, 59, 14, 236, 242, 221]);
    const instructionData = Buffer.alloc(9);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);

    console.log('[claimWinnings] programId:', programIdStr);
    console.log('[claimWinnings] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[claimWinnings] Accounts:', {
      market: marketPda.toBase58(),
      position: betPositionPda.toBase58(),
      feeVault: feeVaultPda.toBase58(),
      bettor: walletAddress,
    });

    // Accounts: market (writable), bet_position (writable), fee_vault (writable), bettor (signer, writable), system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: betPositionPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    const payoutLamports = userBet.potential_payout ? Math.round(userBet.potential_payout * 1_000_000_000) : 0;

    return Response.json({
      success: true,
      message: `Ready to claim ◎${(userBet.potential_payout || 0).toFixed(4)} SOL`,
      userBetId,
      payout: userBet.potential_payout || 0,
      solana_instruction: {
        instruction_type: 'claim_winnings',
        programId: programIdStr,
        keys,
        instruction_data: instructionData.toString('base64'),
        amountLamports: payoutLamports,
      },
    });

  } catch (error) {
    console.error('[claimWinnings] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});