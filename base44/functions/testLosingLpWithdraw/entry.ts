import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey, Connection } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }

    const body = await req.json();
    const userBetId = body.userBetId;
    if (!userBetId) {
      return Response.json({ error: 'Missing userBetId' }, { status: 400 });
    }

    // Fetch UserBet
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) {
      return Response.json({ error: 'UserBet not found' }, { status: 404 });
    }

    // Fetch BetOffer
    const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
    const offer = offers[0];
    if (!offer) {
      return Response.json({ error: 'BetOffer not found' }, { status: 404 });
    }

    // Fetch Bet
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    if (bet.status !== 'settled') {
      return Response.json({ error: 'Market not settled yet' }, { status: 400 });
    }

    if (!bet.winning_outcome || bet.winning_outcome === '') {
      return Response.json({ error: 'Winning outcome not set' }, { status: 400 });
    }

    // Check if this is a LOSING LP (backed outcome == winning outcome = LP lost)
    if (userBet.outcome !== bet.winning_outcome) {
      return Response.json({ 
        error: 'This is a WINNING LP position - use normal withdrawLpWinnings instead',
      }, { status: 400 });
    }

    const walletAddress = userBet.wallet_address || offer.lp_wallet_address;
    if (!walletAddress) {
      return Response.json({ error: 'No wallet address found' }, { status: 400 });
    }

    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
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

    const outcomeValue = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    const lpOfferPda = offer.solana_position_pda ? new PublicKey(offer.solana_position_pda) : null;
    
    if (!lpOfferPda) {
      return Response.json({ error: 'LP position PDA not found' }, { status: 400 });
    }

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    // Check on-chain state
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const lpOfferAccountInfo = await connection.getAccountInfo(lpOfferPda);
    if (!lpOfferAccountInfo) {
      return Response.json({ error: 'LP position not found on-chain' }, { status: 404 });
    }

    const accountData = lpOfferAccountInfo.data;
    const amountMatchedOnChain = Number(accountData.readBigUInt64LE(89));

    if (amountMatchedOnChain <= 0) {
      return Response.json({ error: 'No matched liquidity on-chain' }, { status: 400 });
    }

    return Response.json({
      success: true,
      test: {
        purpose: 'Prove on-chain logic is inverted',
        expected_result: 'Transaction should FAIL with error 6009 if deployed program has correct != logic',
        buggy_result: 'Transaction will SUCCEED if deployed program has inverted == logic',
      },
      userBetId: userBet.id,
      offerId: offer.id,
      solana_instruction: {
        instruction_type: 'withdraw_lp_winnings',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        feeVaultPda: feeVaultPda.toBase58(),
        lpWalletPubkey: userPubkey.toBase58(),
        withdrawAmountLamports: amountMatchedOnChain,
        withdrawAmount: amountMatchedOnChain / 1e9,
      },
      message: `TEST: Attempting to withdraw ◎${(amountMatchedOnChain / 1e9).toFixed(4)} from a LOSING LP position`,
    });

  } catch (error) {
    console.error('testLosingLpWithdraw error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});