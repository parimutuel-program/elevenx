import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Pari-mutuel claim — winner claims proportional share of the pool.
 * Uses wallet-only authentication (no email login required).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const payload = await req.json();
    const { userBetId, batchBetIds, walletAddress } = payload;
    
    console.log('[claimWinnings] Request payload:', { userBetId, batchBetIds, walletAddress: walletAddress?.slice(0, 8) + '...' });
    
    if (!walletAddress) {
      console.error('[claimWinnings] Missing wallet address in request');
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    // Validate wallet format
    const trimmedWallet = walletAddress.trim();
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedWallet)) {
      console.error('[claimWinnings] Invalid wallet format:', trimmedWallet, 'length:', trimmedWallet.length);
      return Response.json({ error: 'Invalid wallet address format', received: trimmedWallet, length: trimmedWallet.length }, { status: 400 });
    }

    // Support both single bet and batch claiming
    const betIdsToProcess = batchBetIds || [userBetId];
    
    if (!betIdsToProcess || betIdsToProcess.length === 0) {
      console.error('[claimWinnings] Missing bet IDs');
      return Response.json({ error: 'Missing userBetId or batchBetIds' }, { status: 400 });
    }

    // Get all user bets to claim - filter by wallet_address
    const allUserBets = await serviceRole.entities.UserBet.list();
    console.log('[claimWinnings] Total UserBets:', allUserBets.length);
    
    // After emergency_settle, bets may still be in 'active' status - check on-chain settled status
    // Filter for bets that can be claimed: 'won' status OR 'active' + market has winning_outcome (emergency settled)
    const betsToClaim = allUserBets.filter(ub => 
      betIdsToProcess.includes(ub.id) && 
      ub.wallet_address === trimmedWallet &&
      (ub.status === 'won' || ub.status === 'active')
    );

    console.log('[claimWinnings] Found potential bets:', betsToClaim.length);

    if (betsToClaim.length === 0) {
      const userBets = allUserBets.filter(ub => ub.wallet_address === trimmedWallet);
      console.log('[claimWinnings] Wallet statuses:', userBets.map(b => ({ id: b.id, status: b.status, outcome: b.outcome })));
      return Response.json({ 
        error: 'No claimable bets found (need status "won" or "active" with market settled)',
        debug: { walletBets: userBets.length, requestedBetIds: betIdsToProcess }
      }, { status: 404 });
    }
    
    // Verify bets actually won by checking market winning_outcome matches bet outcome
    let validBets = [];
    for (const ub of betsToClaim) {
      const bet = (await serviceRole.entities.Bet.filter({ id: ub.bet_id }))[0];
      if (bet && bet.winning_outcome && bet.winning_outcome.length > 0) {
        // Check if user's outcome matches the winning outcome
        if (ub.outcome === bet.winning_outcome) {
          validBets.push(ub);
        } else {
          console.log('[claimWinnings] Bet outcome mismatch:', { userOutcome: ub.outcome, winningOutcome: bet.winning_outcome });
        }
      } else if (ub.status === 'won') {
        // 'won' status already validated
        validBets.push(ub);
      }
    }
    
    if (validBets.length === 0) {
      return Response.json({ 
        error: 'No bets won this settlement',
        attempted: betsToClaim.length
      }, { status: 404 });
    }
    const betsToClaim_validated = validBets;

    const userBet = betsToClaim_validated[0];

    const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
    const bet  = bets[0];
    if (!bet) {
      console.error('[claimWinnings] Bet entity not found for userBet:', userBet.id, 'bet_id:', userBet.bet_id);
      return Response.json({ 
        error: 'Bet entity not found - cannot process claim',
        userBetId: userBet.id,
        bet_id: userBet.bet_id
      }, { status: 404 });
    }

    // Check on-chain market state
    const { Connection: SolanaConnection } = await import('npm:@solana/web3.js@1.98.4');
    const connection = new SolanaConnection('https://api.devnet.solana.com', 'confirmed');
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);

    const marketInfo = await connection.getAccountInfo(marketPda);
    const isVoided = marketInfo && marketInfo.data.length >= 249 && marketInfo.data[245] === 1;
    const isSettledOnChain = marketInfo && marketInfo.data.length >= 249 && marketInfo.data[244] === 1;
    
    // Check if position exists on-chain and read its state
    const bettorPubkey = new PublicKey(trimmedWallet);
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );
    const positionInfo = await connection.getAccountInfo(positionPda);
    const positionExists = !!positionInfo;
    
    let positionData = null;
    if (positionInfo) {
      const data = positionInfo.data;
      console.log('[claimWinnings] Position data length:', data.length);
      console.log('[claimWinnings] Position data (hex):', data.toString('hex'));
      
      // Parse based on actual BetPosition layout:
      // 8 (disc) + 32 (market) + 32 (bettor) + 1 (outcome) + 8 (matched_stake) + 8 (pending_stake) + 8 (odds_bps) + 8 (potential_payout) + 8 (claimable) + 1 (claimed) + 1 (bump) = 107 bytes
      if (data.length >= 107) {
        positionData = {
          outcome: data[72],
          matched_stake: data.readBigUInt64LE(73),
          pending_stake: data.readBigUInt64LE(81),
          odds_bps: data.readBigUInt64LE(89),
          potential_payout: data.readBigUInt64LE(97),
          claimable: data.readBigUInt64LE(105),
          claimed: data[113] === 1,
          bump: data[114],
        };
        console.log('[claimWinnings] Position account data:', positionData);
      } else {
        console.log('[claimWinnings] Position data too short:', data.length);
      }
    }
    
    console.log('[claimWinnings] Market state:', {
      marketExists: !!marketInfo,
      isVoided,
      isSettledOnChain,
      positionExists,
      positionPda: positionPda.toBase58(),
      positionData,
    });

    const totalPayout = betsToClaim_validated.reduce((sum, b) => sum + (b.actual_payout || b.potential_payout || 0), 0);
    console.log(`✓ Claim: wallet=${trimmedWallet.slice(0, 8)}... | bets=${betsToClaim_validated.length} | total=${totalPayout} SOL | voided=${isVoided}`);

    // If market is voided, do DB-only claim (no on-chain funds to claim)
    if (isVoided) {
      console.log('[claimWinnings] Market voided — doing DB-only claim');
      for (const b of betsToClaim_validated) {
        await serviceRole.entities.UserBet.update(b.id, {
          status: 'claimed',
          actual_payout: b.actual_payout || b.potential_payout || 0,
        });
      }
      return Response.json({
        success: true,
        db_only: true,
        message: `✓ ${betsToClaim_validated.length} winning bet(s) marked as claimed (market voided).`,
        betIds: betsToClaim_validated.map(b => b.id),
        totalPayout,
      });
    }
    
    // If market not settled on-chain OR position doesn't exist, return error (should not happen for normal claims)
    if (!marketInfo || !isSettledOnChain) {
      console.error('[claimWinnings] Market not settled on-chain yet:', {
        marketExists: !!marketInfo,
        isSettledOnChain,
      });
      return Response.json({ 
        error: 'Market not settled yet - cannot claim winnings',
        marketSettled: isSettledOnChain,
        marketExists: !!marketInfo
      }, { status: 400 });
    }
    
    if (!positionExists || !positionData) {
      console.error('[claimWinnings] Position not found on-chain:', {
        positionExists,
        positionData: !!positionData,
      });
      return Response.json({ 
        error: 'Position not found on-chain - contact support',
        positionPda: positionPda.toBase58()
      }, { status: 404 });
    }
    
    // Check if position was already claimed on-chain
    if (positionData.claimed) {
      console.log('[claimWinnings] Position already claimed on-chain — doing DB-only update');
      for (const b of betsToClaim_validated) {
        await serviceRole.entities.UserBet.update(b.id, {
          status: 'claimed',
          actual_payout: b.actual_payout || b.potential_payout || 0,
        });
      }
      return Response.json({
        success: true,
        db_only: true,
        message: `✓ ${betsToClaim_validated.length} winning bet(s) already claimed on-chain. Updated DB.`,
        betIds: betsToClaim_validated.map(b => b.id),
        totalPayout,
      });
    }
    
    console.log('[claimWinnings] Proceeding with on-chain claim');
    
    // Construct claim_winnings instruction for Solana
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );
    
    const claimAmount = positionData.potential_payout || positionData.claimable || BigInt(0);
    
    const claimInstruction = {
      instruction_type: 'claim_winnings',
      programId: SOLANA_PROGRAM_ID,
      marketPda: marketPda.toBase58(),
      positionPda: positionPda.toBase58(),
      feeVaultPda: feeVaultPda.toBase58(),
      bettorPubkey: trimmedWallet,
      amountLamports: claimAmount.toString(),
    };
    
    return Response.json({
      success: true,
      on_chain: true,
      message: `✓ ${betsToClaim_validated.length} winning bet(s) ready for on-chain claim`,
      betIds: betsToClaim_validated.map(b => b.id),
      totalPayout,
      solana_instruction: claimInstruction,
    });

  } catch (error) {
    console.error('claimWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});