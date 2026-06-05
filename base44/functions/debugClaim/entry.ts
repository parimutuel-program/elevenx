import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Comprehensive debug for claim issues - checks ALL on-chain state
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const payload = await req.json();
    const { userBetId, walletAddress } = payload;
    
    console.log('[debugClaim] Starting comprehensive claim debug...');
    console.log('[debugClaim] userBetId:', userBetId);
    console.log('[debugClaim] walletAddress:', walletAddress);
    
    if (!userBetId) {
      return Response.json({ error: 'Missing userBetId' }, { status: 400 });
    }
    
    // Fetch user bet
    const userBets = await serviceRole.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    
    if (!userBet) {
      return Response.json({ error: 'UserBet not found', userBetId });
    }
    
    console.log('[debugClaim] UserBet:', {
      id: userBet.id,
      status: userBet.status,
      outcome: userBet.outcome,
      amount: userBet.amount,
      potential_payout: userBet.potential_payout,
      actual_payout: userBet.actual_payout,
      wallet_address: userBet.wallet_address,
    });
    
    // Fetch bet
    const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    
    if (!bet) {
      return Response.json({ error: 'Bet not found', bet_id: userBet.bet_id });
    }
    
    console.log('[debugClaim] Bet:', {
      id: bet.id,
      status: bet.status,
      winning_outcome: bet.winning_outcome,
      match_id: bet.match_id,
    });
    
    // Connect to Solana
    const { Connection: SolanaConnection } = await import('npm:@solana/web3.js@1.98.4');
    const connection = new SolanaConnection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    
    // Derive PDAs
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));
    
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
    const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);
    const bettorPubkey = new PublicKey(userBet.wallet_address || walletAddress);
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );
    
    console.log('[debugClaim] PDAs:', {
      marketPda: marketPda.toBase58(),
      platformPda: platformPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      positionPda: positionPda.toBase58(),
      bettorPubkey: bettorPubkey.toBase58(),
    });
    
    // Check all accounts
    const [marketInfo, platformInfo, feeVaultInfo, positionInfo] = await Promise.all([
      connection.getAccountInfo(marketPda),
      connection.getAccountInfo(platformPda),
      connection.getAccountInfo(feeVaultPda),
      connection.getAccountInfo(positionPda),
    ]);
    
    console.log('[debugClaim] Account existence:', {
      marketExists: !!marketInfo,
      platformExists: !!platformInfo,
      feeVaultExists: !!feeVaultInfo,
      positionExists: !!positionInfo,
    });
    
    const result: any = {
      userBet: {
        id: userBet.id,
        status: userBet.status,
        outcome: userBet.outcome,
        amount: userBet.amount,
        potential_payout: userBet.potential_payout,
      },
      bet: {
        id: bet.id,
        status: bet.status,
        winning_outcome: bet.winning_outcome,
      },
      pdas: {
        marketPda: marketPda.toBase58(),
        platformPda: platformPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
        positionPda: positionPda.toBase58(),
      },
      accounts: {
        market: {
          exists: !!marketInfo,
          lamports: marketInfo?.lamports || 0,
          owner: marketInfo?.owner.toBase58(),
        },
        platform: {
          exists: !!platformInfo,
          lamports: platformInfo?.lamports || 0,
        },
        feeVault: {
          exists: !!feeVaultInfo,
          lamports: feeVaultInfo?.lamports || 0,
        },
        position: {
          exists: !!positionInfo,
          lamports: positionInfo?.lamports || 0,
        },
      },
      canClaim: true,
      blockers: [] as string[],
    };
    
    // Parse market state
    if (marketInfo) {
      const marketData = marketInfo.data;
      console.log('[debugClaim] Market data length:', marketData.length);
      
      if (marketData.length >= 249) {
        result.market = {
          settled: marketData[244] === 1,
          voided: marketData[245] === 1,
          paused: marketData[246] === 1,
          outcome_count: marketData[247],
          fee_percent: marketData.readUInt16LE(248),
        };
        console.log('[debugClaim] Market state:', result.market);
      }
    }
    
    // Parse position state
    if (positionInfo) {
      const positionData = positionInfo.data;
      console.log('[debugClaim] Position data length:', positionData.length);
      
      if (positionData.length >= 115) {
        result.position = {
          outcome: positionData[72],
          matched_stake: Number(positionData.readBigUInt64LE(73)),
          pending_stake: Number(positionData.readBigUInt64LE(81)),
          odds_bps: Number(positionData.readBigUInt64LE(89)),
          potential_payout: Number(positionData.readBigUInt64LE(97)),
          claimable: Number(positionData.readBigUInt64LE(105)),
          claimed: positionData[113] === 1,
          bump: positionData[114],
        };
        console.log('[debugClaim] Position state:', result.position);
      }
    }
    
    // Check claim eligibility
    if (!platformInfo) {
      result.blockers.push('❌ Platform config not initialized');
      result.canClaim = false;
    }
    
    if (!feeVaultInfo) {
      result.blockers.push('❌ Fee vault not initialized (created with platform)');
      result.canClaim = false;
    }
    
    if (!marketInfo) {
      result.blockers.push('❌ Market PDA does not exist on-chain');
      result.canClaim = false;
    }
    
    if (!positionInfo) {
      result.blockers.push('❌ Position PDA does not exist on-chain');
      result.canClaim = false;
    }
    
    if (marketInfo && marketInfo.data.length >= 249 && marketData[244] !== 1) {
      result.blockers.push('❌ Market not settled yet');
      result.canClaim = false;
    }
    
    if (positionInfo && positionData.length >= 115 && positionData[113] === 1) {
      result.blockers.push('❌ Position already claimed');
      result.canClaim = false;
    }
    
    // Check if market has enough SOL
    const claimAmount = result.position?.potential_payout || userBet.potential_payout || 0;
    const claimAmountLamports = BigInt(Math.floor(claimAmount * 1e9));
    
    if (marketInfo && marketInfo.lamports < Number(claimAmountLamports)) {
      result.blockers.push(`❌ Market insolvency: has ${marketInfo.lamports} lamports, needs ${claimAmountLamports}`);
      result.canClaim = false;
    }
    
    result.claimAmount = {
      sol: claimAmount,
      lamports: Number(claimAmountLamports),
    };
    
    // Final verdict
    if (result.canClaim) {
      result.verdict = '✅ CAN CLAIM - All checks passed';
    } else {
      result.verdict = '❌ CANNOT CLAIM - ' + result.blockers.join(', ');
    }
    
    console.log('[debugClaim] Final result:', result);
    
    return Response.json(result);
    
  } catch (error) {
    console.error('[debugClaim] Error:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});