import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// DEPLOYMENT FIX 2026-06-10T23:45:00Z - Force fresh deployment to resolve wrong instruction issue
// This function MUST return claim_winnings instruction with discriminator [161,215,24,59,14,236,242,221]
// NOT settlement instruction [23,224,211,209,146,125,80,245]

// Helper function to compute SHA256 hash (returns hex string)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || '9nwxZGK9nceBL1hPHDgyKeEkvGVjKuHY3Cq6vADXQ7GS';

/**
 * Pari-mutuel claim — winner claims proportional share of the pool.
 * Uses wallet-only authentication (no email login required).
 * 
 * REDEPLOYED: 2026-06-10T20:45:00Z - Fixed discriminator to [161,215,24,59,14,236,242,221]
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
      const requestedBets = allUserBets.filter(ub => betIdsToProcess.includes(ub.id));
      console.log('[claimWinnings] DEBUG - Wallet bets:', userBets.map(b => ({ id: b.id, status: b.status, outcome: b.outcome, wallet: b.wallet_address?.slice(0, 8) })));
      console.log('[claimWinnings] DEBUG - Requested bet IDs:', betIdsToProcess);
      console.log('[claimWinnings] DEBUG - Found requested bets:', requestedBets.map(b => ({ id: b.id, status: b.status, wallet: b.wallet_address?.slice(0, 8), matches_wallet: b.wallet_address === trimmedWallet })));
      return Response.json({ 
        error: 'No claimable bets found',
        debug: { 
          walletBets: userBets.length, 
          requestedBetIds: betIdsToProcess,
          foundRequestedBets: requestedBets.map(b => ({ id: b.id, status: b.status, wallet_matches: b.wallet_address === trimmedWallet })),
          walletUsed: trimmedWallet.slice(0, 16) + '...'
        },
        hint: 'Bet must have status "won" or "active" AND wallet address must match'
      }, { status: 404 });
    }
    
    // Will validate bets after on-chain check below
    let validBets = [];

    const userBet = betsToClaim[0];

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
    
    console.log('[claimWinnings] === BET ENTITY DEBUG ===');
    console.log('[claimWinnings] Bet ID:', bet.id);
    console.log('[claimWinnings] Bet title:', bet.title);
    console.log('[claimWinnings] Bet status:', bet.status);
    console.log('[claimWinnings] Bet winning_outcome:', bet.winning_outcome);
    console.log('[claimWinnings] Bet solana_market_pda:', bet.solana_market_pda);
    console.log('[claimWinnings] Bet.solana_market_pda matches derived PDA:', bet.solana_market_pda === marketPda.toBase58());

    // CRITICAL DEBUG: Log the EXACT market PDA being checked
    console.log('[claimWinnings] === MARKET PDA DEBUG ===');
    console.log('[claimWinnings] userBet.match_id:', userBet.match_id);
    console.log('[claimWinnings] userBet.bet_id:', userBet.bet_id);
    console.log('[claimWinnings] Derived market PDA:', marketPda.toBase58());
    console.log('[claimWinnings] Expected market PDA (from user): 7TYAbqA5hCiwQZBzMhu6LaTJ51xP8Z4WfUNQmewf8mW5');
    console.log('[claimWinnings] PDA match:', marketPda.toBase58() === '7TYAbqA5hCiwQZBzMhu6LaTJ51xP8Z4WfUNQmewf8mW5');
    
    const marketInfo = await connection.getAccountInfo(marketPda);
    console.log('[claimWinnings] Market account exists:', !!marketInfo);
    console.log('[claimWinnings] Market account data length:', marketInfo?.data.length);
    console.log('[claimWinnings] Market account lamports:', marketInfo?.lamports);
    
    // BetMarket account layout (281 bytes):
    // - winning_outcome: byte 155 (u8 enum: 0=unsettled, 1=a, 2=b, 3=draw)
    // - settled: byte 276 (bool)
    // - voided: byte 277 (bool)
    if (marketInfo && marketInfo.data.length >= 281) {
      const winningOutcomeByte = marketInfo.data[155];
      const settledFlag = marketInfo.data[276];
      const voidedFlag = marketInfo.data[277];
      console.log('[claimWinnings] Market winning_outcome (byte 155):', winningOutcomeByte, '(0=unsettled, 1=a, 2=b, 3=draw)');
      console.log('[claimWinnings] Market settled (byte 276):', settledFlag);
      console.log('[claimWinnings] Market voided (byte 277):', voidedFlag);
      console.log('[claimWinnings] Market is settled (on-chain):', settledFlag === 1);
    }
    
    const isSettledOnChain = marketInfo && marketInfo.data.length >= 281 && marketInfo.data[276] === 1;
    
    // Check if position exists on-chain and read its state - include outcome byte in PDA
    const bettorPubkey = new PublicKey(trimmedWallet);
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
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
      // 8 (disc) + 32 (market) + 32 (bettor) + 1 (outcome) + 8 (matched_stake) + 8 (pending_stake) + 8 (odds_bps) + 8 (potential_payout) + 8 (claimable) + 1 (claimed) + 1 (bump) = 115 bytes
      if (data.length >= 115) {
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
      isSettledOnChain,
      positionExists,
      positionPda: positionPda.toBase58(),
      positionData,
    });

    // NOW validate bets using on-chain data (TRUST ON-CHAIN OVER DATABASE)
    const winningOutcomeByte = marketInfo?.data?.[155];
    let onChainWinningOutcome = null;
    if (winningOutcomeByte === 1) onChainWinningOutcome = 'a';
    else if (winningOutcomeByte === 2) onChainWinningOutcome = 'b';
    else if (winningOutcomeByte === 3) onChainWinningOutcome = 'draw';
    
    console.log('[claimWinnings] === BET VALIDATION (ON-CHAIN) ===');
    console.log('[claimWinnings] On-chain winning_outcome:', onChainWinningOutcome);
    
    validBets = [];
    for (const ub of betsToClaim) {
      const betDebug = {
        userBetId: ub.id,
        userOutcome: ub.outcome,
        userStatus: ub.status,
        onChainWinningOutcome,
        matched: false,
        reason: ''
      };
      
      if (isSettledOnChain && onChainWinningOutcome) {
        if (ub.outcome === onChainWinningOutcome) {
          validBets.push(ub);
          betDebug.matched = true;
          betDebug.reason = 'outcome_matched_on_chain';
          console.log('[claimWinnings] ✓ Valid bet:', betDebug);
        } else {
          betDebug.reason = `outcome_mismatch (user: ${ub.outcome}, on_chain: ${onChainWinningOutcome})`;
          console.log('[claimWinnings] ✗ Outcome mismatch:', betDebug);
        }
      } else if (ub.status === 'won') {
        validBets.push(ub);
        betDebug.matched = true;
        betDebug.reason = 'status_won';
        console.log('[claimWinnings] ✓ Won status:', betDebug);
      } else {
        betDebug.reason = 'market_not_settled_on_chain';
        console.log('[claimWinnings] ✗ Not settled:', betDebug);
      }
    }
    
    if (validBets.length === 0) {
      console.log('[claimWinnings] No valid bets after on-chain validation');
      return Response.json({ 
        error: 'No winning bets found',
        debug: { 
          attempted: betsToClaim.length,
          onChainWinningOutcome,
          isSettledOnChain,
          hint: 'Market must be settled on-chain AND your outcome must match the winner'
        }
      }, { status: 404 });
    }

    const totalPayout = validBets.reduce((sum, b) => sum + (b.actual_payout || b.potential_payout || 0), 0);
    console.log(`✓ Claim: wallet=${trimmedWallet.slice(0, 8)}... | bets=${betsToClaim_validated.length} | total=${totalPayout} SOL`);

    // Validate market is settled and position exists
    if (!marketInfo || !isSettledOnChain) {
      console.error('[claimWinnings] Market not settled on-chain yet');
      return Response.json({ 
        error: 'Market not settled yet - cannot claim winnings',
        marketSettled: isSettledOnChain,
        marketExists: !!marketInfo
      }, { status: 400 });
    }
    
    if (!positionExists || !positionData) {
      console.error('[claimWinnings] Position not found on-chain');
      return Response.json({ 
        error: 'Position not found on-chain - contact support',
        positionPda: positionPda.toBase58()
      }, { status: 404 });
    }
    
    // Check if position was already claimed on-chain
    if (positionData.claimed) {
      console.log('[claimWinnings] Position already claimed on-chain');
      return Response.json({ 
        error: 'Winnings already claimed on-chain',
        positionPda: positionPda.toBase58()
      }, { status: 400 });
    }
    
    console.log('[claimWinnings] Proceeding with on-chain claim');
    console.log('[claimWinnings] Validated bets:', validBets.length);
    
    // Construct claim_winnings instruction for Solana
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );
    
    const claimAmount = positionData.potential_payout || positionData.claimable || BigInt(0);
    
    // Check fee vault and market lamports
    const feeVaultInfo = await connection.getAccountInfo(feeVaultPda);
    console.log('[claimWinnings] Fee vault exists:', !!feeVaultInfo, 'lamports:', feeVaultInfo?.lamports);
    console.log('[claimWinnings] Market lamports:', marketInfo?.lamports);
    console.log('[claimWinnings] Claim amount (lamports):', Number(claimAmount));
    
    // CRITICAL: fee_vault MUST exist before claiming - it's required by the program
    if (!feeVaultInfo) {
      console.error('[claimWinnings] Fee vault not initialized on-chain:', feeVaultPda.toBase58());
      console.error('[claimWinnings] Platform may not be initialized. Check platform config PDA.');
      
      // Check if platform config exists
      const [platformPda] = PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
      const platformInfo = await connection.getAccountInfo(platformPda);
      
      return Response.json({
        error: 'Platform not fully initialized - fee vault missing',
        feeVaultPda: feeVaultPda.toBase58(),
        platformExists: !!platformInfo,
        platformPda: platformPda.toBase58(),
        marketLamports: marketLamports,
        claimAmount: Number(claimAmount),
        debug: 'Admin must initialize platform first (creates fee_vault)',
      }, { status: 500 });
    }
    
    // Check if market has enough SOL for the claim (including potential fee)
    const marketLamports = marketInfo?.lamports || 0;
    const feeVaultLamports = feeVaultInfo?.lamports || 0;
    const requiredLamports = Number(claimAmount);
    
    // Market can use fee vault funds if needed (fee vault holds platform fees + unmatched LP funds)
    const totalAvailableLamports = marketLamports + feeVaultLamports;
    
    // Market needs to have at least the claim amount (program will deduct fee)
    if (totalAvailableLamports < requiredLamports) {
      console.error('[claimWinnings] Market insolvency detected:', {
        marketLamports,
        feeVaultLamports,
        totalAvailableLamports,
        requiredLamports,
        deficit: requiredLamports - totalAvailableLamports,
      });
      return Response.json({
        error: 'Market PDA has insufficient SOL for this claim (even with fee vault)',
        marketLamports,
        feeVaultLamports,
        totalAvailableLamports,
        requiredLamports,
        deficit: requiredLamports - totalAvailableLamports,
        feeVaultPda: feeVaultPda.toBase58(),
        positionPda: positionPda.toBase58(),
      }, { status: 400 });
    }
    
    if (marketLamports < requiredLamports) {
      console.log('[claimWinnings] Market has insufficient SOL but fee vault will cover:', {
        marketLamports,
        feeVaultLamports,
        requiredLamports,
      });
    }
    
    // Build accounts array in the EXACT order required by ClaimWinnings struct:
    // 1. market (mutable, PDA)
    // 2. bet_position (mutable, PDA)
    // 3. fee_vault (mutable, PDA)
    // 4. bettor (mutable, signer)
    // 5. system_program (readonly, not signer)
    // Build instruction data: 8-byte discriminator + 1-byte outcome parameter
    const discriminator = Buffer.from(await sha256('global:claim_winnings'), 'hex').slice(0, 8);
    const instructionData = Buffer.alloc(9);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);
    
    // DEBUG: Log discriminator bytes to verify
    console.log('[claimWinnings] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[claimWinnings] Discriminator (bytes):', Array.from(discriminator));
    console.log('[claimWinnings] Instruction data (hex):', instructionData.toString('hex'));
    console.log('[claimWinnings] Instruction data (base64):', instructionData.toString('base64'));
    
    // DEBUG: Log accounts
    console.log('[claimWinnings] Accounts:');
    console.log('  [0] market:', marketPda.toBase58(), '(writable)');
    console.log('  [1] position:', positionPda.toBase58(), '(writable)');
    console.log('  [2] fee_vault:', feeVaultPda.toBase58(), '(writable)');
    console.log('  [3] bettor:', trimmedWallet, '(writable, signer)');
    console.log('  [4] system_program: 11111111111111111111111111111111 (readonly)');
    
    const claimInstruction = {
      instruction_type: 'claim_winnings',
      programId: SOLANA_PROGRAM_ID,
      keys: [
        { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: positionPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
        { pubkey: trimmedWallet, isSigner: true, isWritable: true },
        { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
      ],
      instruction_data: instructionData.toString('base64'),
      debug: {
        marketLamports: marketInfo?.lamports,
        feeVaultExists: !!feeVaultInfo,
        feeVaultLamports: feeVaultInfo?.lamports,
        claimAmount: Number(claimAmount),
        positionData: {
          matched_stake: Number(positionData.matched_stake),
          potential_payout: Number(positionData.potential_payout),
          claimable: Number(positionData.claimable),
          pending_stake: Number(positionData.pending_stake),
        },
      },
    };
    
    // CRITICAL DEBUG: Log full instruction before returning
    console.log('[claimWinnings] FINAL INSTRUCTION:', {
      instruction_type: claimInstruction.instruction_type,
      discriminator_hex: instructionData.slice(0, 8).toString('hex'),
      discriminator_bytes: Array.from(instructionData.slice(0, 8)),
      accounts: claimInstruction.keys.map(k => ({ pubkey: k.pubkey, isSigner: k.isSigner, isWritable: k.isWritable })),
      instruction_data_base64: claimInstruction.instruction_data,
    });
    
    return Response.json({
      success: true,
      message: `✓ ${validBets.length} winning bet(s) ready for claim`,
      betIds: validBets.map(b => b.id),
      totalPayout: Number(totalPayout),
      solana_instruction: claimInstruction,
    });

  } catch (error) {
    console.error('=== claimWinnings ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('==========================');
    return Response.json({ error: error.message, stack: error.stack, name: error.name }, { status: 500 });
  }
});