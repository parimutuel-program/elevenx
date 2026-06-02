import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

/**
 * LP withdraws unmatched liquidity.
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
    const { walletAddress, userBetId } = payload;

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!userBetId) return Response.json({ error: 'Missing userBetId' }, { status: 400 });

    if (!base58Regex.test(walletAddress)) {
      return Response.json({ error: 'Invalid wallet address format. Please reconnect your wallet.' }, { status: 400 });
    }

    // Fetch UserBet
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) return Response.json({ error: 'UserBet not found' }, { status: 404 });
    if (userBet.role !== 'lp') return Response.json({ error: 'Not an LP bet' }, { status: 400 });
    if (userBet.status !== 'pending') return Response.json({ error: 'Bet is not pending' }, { status: 400 });

    // Fetch BetOffer to get the unmatched amount
    if (!userBet.offer_id) return Response.json({ error: 'No offer linked' }, { status: 400 });
    const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
    const offer = offers[0];
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    
    console.log('Withdraw check - Offer status:', offer.status, 'amount_unmatched:', offer.amount_unmatched, 'userBet.status:', userBet.status);
    
    // If offer is cancelled/settled but UserBet is still pending, allow withdrawal of the original amount
    // This handles the case where DB wasn't updated after on-chain withdrawal
    let withdrawAmount = offer.amount_unmatched || 0;
    if ((offer.status === 'cancelled' || offer.status === 'settled') && userBet.status === 'pending') {
      // Use the UserBet amount since offer was cancelled but funds weren't returned
      withdrawAmount = userBet.amount || 0;
      console.log('Allowing withdrawal for cancelled offer with pending UserBet, amount:', withdrawAmount);
    } else if (offer.status === 'cancelled' || offer.status === 'settled') {
      return Response.json({ error: 'Offer is ' + offer.status + ' and UserBet is ' + userBet.status + ', cannot withdraw' }, { status: 400 });
    }
    
    // Verify there's unmatched liquidity
    if (withdrawAmount <= 0) {
      return Response.json({ error: 'No unmatched liquidity remaining (offer may be fully matched)' }, { status: 400 });
    }

    // Fetch Bet and Match
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') return Response.json({ error: 'Bet not open' }, { status: 400 });

    const matches = await base44.entities.Match.filter({ id: userBet.match_id });
    const match = matches[0];

    // Derive outcome index (0=a, 1=draw, 2=b)
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'draw' ? 1 : 2;

    // Derive PDAs
    const lpPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    return Response.json({
      success: true,
      userBetId,
      offerId: offer.id,
      amount: withdrawAmount,
      solana_instruction: {
        instruction_type: 'withdraw_liquidity',
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        outcome: outcomeIndex,
        amountLamports: Math.round(withdrawAmount * 1_000_000_000),
      },
      message: `Sign to withdraw ◎${withdrawAmount} unmatched liquidity`,
    });

  } catch (error) {
    console.error('withdrawLiquidity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});