import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Generate Solana instruction for LPs to withdraw winnings from settled markets.
 * INCLUDES LP fee bonus: Real LP stakers (role='lp') automatically receive a share
 * of platform fees when they withdraw from winning markets.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }
    
    const { userBetId } = await req.json();
    if (!userBetId) {
      return Response.json({ error: 'Missing userBetId' }, { status: 400 });
    }

    // Fetch UserBet
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) {
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    // Must be LP role
    if (userBet.role !== 'lp') {
      return Response.json({ error: 'Only LP positions can withdraw winnings' }, { status: 400 });
    }

    // Fetch BetOffer to get the PDA
    if (!userBet.offer_id) {
      return Response.json({ error: 'LP offer not found' }, { status: 400 });
    }
    
    const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
    const offer = offers[0];
    if (!offer) {
      return Response.json({ error: 'BetOffer not found' }, { status: 404 });
    }

    // Fetch Bet to check settlement
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    // Market must be settled
    if (bet.status !== 'settled') {
      return Response.json({ error: 'Market has not been settled yet' }, { status: 400 });
    }

    // Check if LP's outcome won
    if (userBet.outcome !== bet.winning_outcome) {
      return Response.json({ error: 'This LP position did not win' }, { status: 400 });
    }

    // Get wallet address
    const walletAddress = userBet.wallet_address || offer.lp_wallet_address;
    if (!walletAddress) {
      return Response.json({ error: 'No wallet address found' }, { status: 400 });
    }

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(walletAddress) || !base58Regex.test(SOLANA_PROGRAM_ID)) {
      return Response.json({ error: 'Invalid address format' }, { status: 400 });
    }

    // Derive PDAs
    const userPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    // Use the stored LP offer PDA
    const lpOfferPda = new PublicKey(offer.solana_position_pda);

    // Fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Calculate LP winnings: matched stake from the offer
    // The LP earns the losing side's stakes (matched against their liquidity)
    let baseAmount = offer.amount_matched || 0;
    
    // LP FEE BONUS: Calculate and add fee share for real LP stakers
    // Only LPs (role='lp') get the bonus, not regular bettors (role='matcher')
    let lpBonus = 0;
    
    // Get all losing UserBets for this market to calculate fee pool
    const allUserBets = await serviceRole.entities.UserBet.filter({ match_id: userBet.match_id });
    const losingBets = allUserBets.filter(ub => 
      ub.outcome !== bet.winning_outcome && 
      ub.status === 'lost'
    );
    
    // Calculate total losing pool (platform fee source)
    const totalLosingPool = losingBets.reduce((sum, b) => sum + (b.amount || 0), 0);
    
    // Platform fee: 5% of losing pool
    const feePercent = 0.05; // 5%
    const totalPlatformFee = totalLosingPool * feePercent;
    
    // LP incentive share: 50% of platform fee goes to LP stakers
    const lpIncentivePool = totalPlatformFee * 0.5;
    
    // Get all winning LPs (role='lp') for this market to split the incentive
    const winningLps = allUserBets.filter(ub => 
      ub.outcome === bet.winning_outcome && 
      ub.role === 'lp' &&
      ub.status === 'won'
    );
    
    // Calculate total LP liquidity on winning side
    const totalWinningLpLiquidity = winningLps.reduce((sum, ub) => sum + (ub.amount || 0), 0);
    
    // This LP's share of the incentive pool
    if (totalWinningLpLiquidity > 0 && userBet.role === 'lp') {
      const lpShare = (userBet.amount || 0) / totalWinningLpLiquidity;
      lpBonus = lpIncentivePool * lpShare;
      console.log('[withdrawLpWinnings] LP Fee Bonus:', {
        wallet: walletAddress.slice(0, 8) + '...',
        totalLosingPool,
        totalPlatformFee,
        lpIncentivePool,
        lpShare: (lpShare * 100).toFixed(2) + '%',
        lpBonus,
      });
    }
    
    const withdrawAmountLamports = Math.round((baseAmount + lpBonus) * 1_000_000_000);

    return Response.json({
      success: true,
      withdrawAmount: baseAmount,
      lpFeeBonus: lpBonus,
      totalWithdraw: baseAmount + lpBonus,
      userBetId,
      offerId: offer.id,
      solana_instruction: {
        instruction_type: 'withdraw_lp_winnings',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
        lpWalletPubkey: userPubkey.toBase58(),
        withdrawAmountLamports,
        outcome: userBet.outcome === 'a' ? 0 : userBet.outcome === 'draw' ? 1 : 2,
      },
      message: lpBonus > 0 
        ? `Sign to withdraw ◎${baseAmount.toFixed(4)} + ◎${lpBonus.toFixed(4)} LP fee bonus = ◎${(baseAmount + lpBonus).toFixed(4)}`
        : `Sign to withdraw ◎${baseAmount.toFixed(4)} from settled market`,
    });

  } catch (error) {
    console.error('withdrawLpWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});