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

    const { userBetId, batchBetIds, walletAddress } = await req.json();
    
    if (!walletAddress) {
      console.error('[claimWinnings] Missing wallet address in request');
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    // Validate wallet format
    const trimmedWallet = walletAddress.trim();
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedWallet)) {
      console.error('[claimWinnings] Invalid wallet format:', trimmedWallet);
      return Response.json({ error: 'Invalid wallet address format' }, { status: 400 });
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
    
    const betsToClaim = allUserBets.filter(ub => 
      betIdsToProcess.includes(ub.id) && 
      ub.wallet_address === trimmedWallet &&
      ub.status === 'won'
    );

    console.log('[claimWinnings] Found bets to claim:', betsToClaim.length, 'bets');

    if (betsToClaim.length === 0) {
      // Debug: check what bets exist for this wallet
      const userBets = allUserBets.filter(ub => ub.wallet_address === trimmedWallet);
      console.log('[claimWinnings] All bets for this wallet:', userBets.length);
      console.log('[claimWinnings] Bet statuses:', userBets.map(b => ({ id: b.id, status: b.status })));
      
      return Response.json({ 
        error: 'No valid won bets found',
        debug: {
          walletBets: userBets.length,
          requestedBetIds: betIdsToProcess,
          statuses: userBets.map(b => ({ id: b.id, status: b.status }))
        }
      }, { status: 404 });
    }

    const userBet = betsToClaim[0];

    const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
    const bet  = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 400 });

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
      // Parse position account data (8 byte discriminator + 87 bytes data = 95 bytes total)
      // Layout: market(32) + bettor(32) + outcome(1) + matched_stake(8) + pending_stake(8) + odds_bps(8) + potential_payout(8) + claimable(8) + claimed(1) + bump(1) = 99 bytes + 8 discriminator = 107 total
      const data = positionInfo.data;
      console.log('[claimWinnings] Position data length:', data.length);
      console.log('[claimWinnings] Position data (hex):', data.toString('hex'));
      
      if (data.length >= 115) {
        positionData = {
          outcome: data[72], // outcome is at offset 72 (8 disc + 32 market + 32 bettor)
          matched_stake: data.readBigUInt64LE(73),
          pending_stake: data.readBigUInt64LE(81),
          odds_bps: data.readBigUInt64LE(89),
          potential_payout: data.readBigUInt64LE(97),
          claimable: data.readBigUInt64LE(105),
          claimed: data[113] === 1, // claimed is at offset 113 (8+32+32+1+8+8+8+8+8+1)
          bump: data[114],
        };
        console.log('[claimWinnings] Position account data:', {
          outcome: positionData.outcome,
          matched_stake: positionData.matched_stake.toString(),
          pending_stake: positionData.pending_stake.toString(),
          potential_payout: positionData.potential_payout.toString(),
          claimed: positionData.claimed,
        });
      } else {
        console.log('[claimWinnings] Position data too short, skipping parse');
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

    const totalPayout = betsToClaim.reduce((sum, b) => sum + (b.actual_payout || b.potential_payout || 0), 0);
    console.log(`✓ Claim: wallet=${trimmedWallet.slice(0, 8)}... | bets=${betsToClaim.length} | total=${totalPayout} SOL | voided=${isVoided}`);

    // If market is voided, not settled on-chain, or position doesn't exist, do DB-only claim
    if (!marketInfo || isVoided || !isSettledOnChain || !positionExists) {
      console.log('[claimWinnings] Market voided/not settled/position missing — doing DB-only claim');
      for (const b of betsToClaim) {
        await serviceRole.entities.UserBet.update(b.id, {
          status: 'claimed',
          actual_payout: b.actual_payout || b.potential_payout || 0,
        });
      }
      return Response.json({
        success: true,
        db_only: true,
        message: `✓ ${betsToClaim.length} winning bet(s) marked as claimed. Market not settled on-chain yet.`,
        betIds: betsToClaim.map(b => b.id),
        totalPayout,
        note: 'Market was settled via DB override. SOL payout is handled separately by admin.',
      });
    }
    
    // Check if position was already claimed on-chain
    if (positionData?.claimed) {
      console.log('[claimWinnings] Position already claimed on-chain — doing DB-only update');
      for (const b of betsToClaim) {
        await serviceRole.entities.UserBet.update(b.id, {
          status: 'claimed',
          actual_payout: b.actual_payout || b.potential_payout || 0,
        });
      }
      return Response.json({
        success: true,
        db_only: true,
        message: `✓ ${betsToClaim.length} winning bet(s) already claimed on-chain. Updated DB status.`,
        betIds: betsToClaim.map(b => b.id),
        totalPayout,
        note: 'Position was already claimed on-chain.',
      });
    }
    
    // Skip claimable check - Solana calculates payout dynamically during claim instruction
    console.log('[claimWinnings] Proceeding with on-chain claim (payout calculated on-chain)');
    
    // Check if position has matched stake
    if (!positionData || positionData.matched_stake === BigInt(0)) {
      console.log('[claimWinnings] Position has no matched stake — doing DB-only claim');
      for (const b of betsToClaim) {
        await serviceRole.entities.UserBet.update(b.id, {
          status: 'claimed',
          actual_payout: b.actual_payout || b.potential_payout || 0,
        });
      }
      return Response.json({
        success: true,
        db_only: true,
        message: `✓ ${betsToClaim.length} winning bet(s) marked as claimed (no matched stake on-chain).`,
        betIds: betsToClaim.map(b => b.id),
        totalPayout,
        note: 'Position has no matched stake on-chain.',
      });
    }

    // Normal on-chain claim path
    const [feeVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('fee_vault')], programId);

    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:claim_winnings'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));

    return Response.json({
      success: true,
      message: `Sign to claim ${betsToClaim.length} winning bet(s)`,
      betIds: betsToClaim.map(b => b.id),
      totalPayout,
      solana_instruction: {
        instruction_type: 'claim_winnings',
        programId: SOLANA_PROGRAM_ID,
        keys: [
          { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: positionPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: feeVaultPda.toBase58(), isSigner: false, isWritable: true },
          { pubkey: trimmedWallet, isSigner: false, isWritable: true },
          { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
        ],
        instruction_data: discriminator.toString('base64'),
      },
    });

  } catch (error) {
    console.error('claimWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});