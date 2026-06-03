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

    const userBet = betsToClaim[0]; // Use first bet for PDA derivation (same match)

    const bets = await serviceRole.entities.Bet.filter({ id: userBet.bet_id });
    const bet  = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 400 });

    const bettorPubkey = new PublicKey(trimmedWallet);
    const programId    = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    // Correct on-chain program seeds (must match Solana program)
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer()],
      programId
    );
    
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    const totalPayout = betsToClaim.reduce((sum, bet) => sum + (bet.actual_payout || bet.potential_payout || 0), 0);
    console.log(`✓ Claim: wallet=${trimmedWallet.slice(0, 8)}... | bets=${betsToClaim.length} | total=${totalPayout} SOL`);

    // Build instruction data: 8-byte Anchor discriminator for claim_winnings
    const discBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:claim_winnings'));
    const discriminator = Buffer.from(new Uint8Array(discBuffer).slice(0, 8));
    
    console.log('[claimWinnings] Discriminator (hex):', discriminator.toString('hex'));

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