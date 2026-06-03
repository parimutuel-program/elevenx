import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Pari-mutuel claim — winner claims proportional share of the pool.
 * Payout = stake × total_pool × (1 - fee%) / winner_pool
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { userBetId, batchBetIds } = await req.json();
    
    // Support both single bet and batch claiming
    const betIdsToProcess = batchBetIds || [userBetId];
    
    if (!betIdsToProcess || betIdsToProcess.length === 0) {
      return Response.json({ error: 'Missing userBetId or batchBetIds' }, { status: 400 });
    }

    // Get all user bets to claim - check both created_by_id and wallet_address for compatibility
    const allUserBets = await base44.entities.UserBet.list();
    const userWalletAddress = user.wallet_address;
    
    const betsToClaim = allUserBets.filter(ub => 
      betIdsToProcess.includes(ub.id) && 
      (ub.created_by_id === user.id || (userWalletAddress && ub.wallet_address === userWalletAddress)) &&
      ub.status === 'won'
    );

    if (betsToClaim.length === 0) {
      return Response.json({ error: 'No valid won bets found' }, { status: 404 });
    }

    const userBet = betsToClaim[0]; // Use first bet for PDA derivation (same match)

    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet  = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 400 });

    const walletAddress = user.wallet_address;
    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 400 });

    const bettorPubkey = new PublicKey(walletAddress);
    const programId    = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    // Use new pari-mutuel PDA seeds
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pm_market'), matchIdBytes],
      programId
    );
    
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'draw' ? 1 : 2;
    
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pm_position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );
    
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pm_fee_vault')],
      programId
    );

    const totalPayout = betsToClaim.reduce((sum, bet) => sum + (bet.actual_payout || bet.potential_payout || 0), 0);
    console.log(`✓ Claim: user=${user.id} | bets=${betsToClaim.length} | total=${totalPayout} SOL`);

    return Response.json({
      success: true,
      message: `Sign to claim ${betsToClaim.length} winning bet(s)`,
      betIds: betsToClaim.map(b => b.id),
      totalPayout,
      solana_instruction: {
        instruction_type: 'claim_winnings',
        programId: SOLANA_PROGRAM_ID,
        marketPda:    marketPda.toBase58(),
        positionPda:  positionPda.toBase58(),
        feeVaultPda:  feeVaultPda.toBase58(),
        bettorPubkey: walletAddress,
      },
    });

  } catch (error) {
    console.error('claimWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});