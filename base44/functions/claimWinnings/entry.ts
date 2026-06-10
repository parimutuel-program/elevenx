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
    console.log('=== [claimWinnings] START ===');
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const { programIdStr, programId, connection } = getSolanaConfig();

    // Log received parameters
    const requestBody = await req.json();
    console.log('[claimWinnings] Received request:', {
      userBetId: requestBody.userBetId,
      walletAddress: requestBody.walletAddress,
      headers: Object.fromEntries(req.headers),
    });

    const { userBetId, walletAddress } = requestBody;

    if (!walletAddress) {
      console.error('[claimWinnings] Missing wallet address in request');
      return Response.json({ 
        error: 'Missing wallet address',
        debug: { received: requestBody }
      }, { status: 400 });
    }

    console.log('[claimWinnings] Validating wallet:', walletAddress);

    // Fetch UserBet
    console.log('[claimWinnings] Fetching UserBet:', userBetId);
    const userBets = await serviceRole.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) {
      console.error('[claimWinnings] UserBet not found:', userBetId);
      return Response.json({ 
        error: 'UserBet not found',
        debug: { userBetId, walletAddress }
      }, { status: 404 });
    }
    console.log('[claimWinnings] UserBet found:', {
      id: userBet.id,
      outcome: userBet.outcome,
      potential_payout: userBet.potential_payout,
      wallet: userBet.wallet_address,
    });

    // Fetch Bet or FuturesMarket entity
    let market, isFutures;
    if (userBet.futures_market_id) {
      console.log('[claimWinnings] Fetching FuturesMarket:', userBet.futures_market_id);
      const futuresMarkets = await serviceRole.entities.FuturesMarket.filter({ id: userBet.futures_market_id });
      market = futuresMarkets[0];
      isFutures = true;
      if (!market) {
        console.error('[claimWinnings] Futures market not found:', userBet.futures_market_id);
        return Response.json({ error: 'Futures market not found' }, { status: 404 });
      }
    } else {
      console.log('[claimWinnings] Fetching Bet:', userBet.bet_id);
      const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
      market = bets[0];
      isFutures = false;
      if (!market) {
        console.error('[claimWinnings] Bet entity not found:', userBet.bet_id);
        return Response.json({ error: 'Bet entity not found' }, { status: 404 });
      }
    }
    console.log('[claimWinnings] Market data:', {
      id: market.id,
      status: market.status,
      winning_outcome: market.winning_outcome,
    });

    // Check market is settled
    if (market.status !== 'settled') {
      console.error('[claimWinnings] Market not settled:', market.status);
      return Response.json({ 
        error: 'Market not settled yet',
        debug: { market_status: market.status, market_id: market.id }
      }, { status: 400 });
    }

    // Verify this bet won
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    let winningOutcome;
    if (isFutures) {
      const winningLabel = market.winning_outcome;
      winningOutcome = winningLabel === '1st' ? 0 : winningLabel === '2nd' ? 1 : 2;
    } else {
      const winningLabel = market.winning_outcome;
      winningOutcome = winningLabel === 'a' ? 0 : winningLabel === 'b' ? 1 : 2;
    }

    console.log('[claimWinnings] Outcome check:', {
      bet_outcome: userBet.outcome,
      outcomeIndex,
      winning_outcome: isFutures ? market.winning_outcome : market.winning_outcome,
      winningOutcome,
      match: outcomeIndex === winningOutcome,
    });

    if (outcomeIndex !== winningOutcome) {
      return Response.json({ 
        error: 'This bet did not win',
        debug: { your_outcome: outcomeIndex, winning_outcome: winningOutcome }
      }, { status: 400 });
    }

    const bettorPubkey = new PublicKey(walletAddress);
    console.log('[claimWinnings] Bettor pubkey:', bettorPubkey.toBase58());
    
    // Derive market PDA
    const marketId = isFutures ? userBet.futures_market_id : userBet.match_id;
    const marketIdBytes = Buffer.alloc(32);
    Buffer.from(marketId, 'utf-8').copy(marketIdBytes, 0, 0, Math.min(marketId.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketIdBytes], programId);
    console.log('[claimWinnings] Market PDA:', marketPda.toBase58());

    // Verify market exists on-chain
    console.log('[claimWinnings] Fetching market account info...');
    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      console.error('[claimWinnings] Market not found on-chain:', marketPda.toBase58());
      return Response.json({ 
        error: 'Market not found on-chain',
        debug: { marketPda: marketPda.toBase58() }
      }, { status: 400 });
    }
    console.log('[claimWinnings] Market account found:', {
      size: marketInfo.data.length,
      lamports: marketInfo.lamports,
      owner: marketInfo.owner.toBase58(),
    });

    // Derive bet_position PDA
    const [betPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );
    console.log('[claimWinnings] Bet Position PDA:', betPositionPda.toBase58());

    // Derive fee_vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);
    console.log('[claimWinnings] Fee Vault PDA:', feeVaultPda.toBase58());

    // Build instruction data
    const discriminator = Buffer.from([161, 215, 24, 59, 14, 236, 242, 221]);
    const instructionData = Buffer.alloc(9);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);

    console.log('[claimWinnings] Instruction data:', {
      discriminator: discriminator.toString('hex'),
      outcome: outcomeIndex,
      full_data: instructionData.toString('hex'),
    });

    // Build accounts
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: betPositionPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];

    console.log('[claimWinnings] Final instruction accounts:', keys);

    const payoutLamports = userBet.potential_payout ? Math.round(userBet.potential_payout * 1_000_000_000) : 0;

    console.log('[claimWinnings] SUCCESS - returning instruction');
    console.log('=== [claimWinnings] END ===\n');

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
    console.error('=== [claimWinnings] ERROR ===');
    console.error('[claimWinnings] Error:', error);
    console.error('[claimWinnings] Error stack:', error.stack);
    console.error('[claimWinnings] Error message:', error.message);
    console.error('[claimWinnings] Error response:', error.response?.data);
    console.error('=== [claimWinnings] ERROR END ===\n');
    return Response.json({ 
      error: error.message,
      stack: error.stack,
      debug: { error_type: error.constructor.name }
    }, { status: 500 });
  }
});