import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * Prepare claim_refund instruction for users who should receive refunds.
 * Returns the Solana instruction for the frontend to sign.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured. Please contact support.' }, { status: 500 });
    }
    
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(SOLANA_PROGRAM_ID)) {
      return Response.json({ error: 'Invalid Solana program ID configuration. Please contact support.' }, { status: 500 });
    }
    
    const payload = await req.json();
    const { userBetId } = payload;

    if (!userBetId) return Response.json({ error: 'Missing userBetId' }, { status: 400 });

    // Fetch UserBet
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) return Response.json({ error: 'UserBet not found' }, { status: 404 });
    
    // Only allow refunds for bets marked as refunded or lost (when market was voided)
    if (userBet.status !== 'refunded' && userBet.status !== 'lost') {
      return Response.json({ error: 'This bet is not eligible for refund' }, { status: 400 });
    }

    // Fetch Bet to check if it's settled/voided
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });
    
    // Check if market was voided (everyone gets refund) or if this is a losing bet that should get refund
    // In the current hybrid model, losers don't get refunds - only voided markets do
    // But if the DB shows 'refunded', we should allow them to claim
    if (bet.status !== 'settled' && bet.status !== 'void') {
      return Response.json({ error: 'Market has not been settled yet' }, { status: 400 });
    }

    // Get wallet address
    const walletAddress = userBet.wallet_address;
    if (!walletAddress) {
      return Response.json({ error: 'No wallet address associated with this bet' }, { status: 400 });
    }
    
    if (!base58Regex.test(walletAddress)) {
      return Response.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    const userPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    let positionPda;
    
    // For LP offers, use the stored solana_position_pda from BetOffer
    if (userBet.role === 'lp' && userBet.offer_id) {
      const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
      const offer = offers[0];
      if (!offer || !offer.solana_position_pda) {
        return Response.json({ error: 'LP offer not found or missing PDA' }, { status: 400 });
      }
      positionPda = new PublicKey(offer.solana_position_pda);
    } else {
      // For regular bettors, derive position PDA
      const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'draw' ? 1 : 2;
      const [derivedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('position'), marketPda.toBuffer(), userPubkey.toBuffer(), Buffer.from([outcomeIndex])],
        programId
      );
      positionPda = derivedPda;
    }

    // Fee vault PDA
    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    return Response.json({
      success: true,
      refundAmount: userBet.amount,
      userBetId,
      solana_instruction: {
        instruction_type: 'claim_refund',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        positionPda: positionPda.toBase58(),
        bettorPubkey: userPubkey.toBase58(),
        refundAmountLamports: Math.round(userBet.amount * 1_000_000_000),
      },
      message: `Sign to claim your refund of ◎${userBet.amount}`,
    });

  } catch (error) {
    console.error('claimRefund error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});