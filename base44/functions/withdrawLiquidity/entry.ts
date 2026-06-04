import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
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
    // Allow withdrawal for any LP position - on-chain check will verify if unmatched funds exist

    // Fetch BetOffer to get the unmatched amount
    if (!userBet.offer_id) return Response.json({ error: 'No offer linked' }, { status: 400 });
    const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
    const offer = offers[0];
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    
    console.log('Withdraw check - Offer status:', offer.status, 'amount_unmatched:', offer.amount_unmatched, 'userBet.status:', userBet.status);
    
    // Check if there's unmatched liquidity in DB
    const withdrawAmount = offer.amount_unmatched || 0;
    if (withdrawAmount <= 0) {
      return Response.json({ error: 'No unmatched liquidity remaining' }, { status: 400 });
    }
    
    // Allow withdrawal even if offer is cancelled/settled - on-chain check will verify funds exist
    


    // Fetch Bet and Match
    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 400 });
    
    // Allow withdrawal if market is open OR settled (for unmatched funds)
    if (bet.status !== 'open' && bet.status !== 'settled') {
      return Response.json({ error: 'Cannot withdraw from this market' }, { status: 400 });
    }

    const matches = await base44.entities.Match.filter({ id: userBet.match_id });
    const match = matches[0];

    // Derive outcome index (0=a, 1=b, 2=draw) - MUST match provideLiquidity
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    
    // Derive PDAs - MUST match Solana program exactly
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const lpPubkey = new PublicKey(walletAddress);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));
    
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );
    
    // Re-derive lp_offer PDA with correct seeds: ["lp_offer", market_pubkey, lp_pubkey, &[outcome]]
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );
    
    console.log('Re-derived PDAs for withdrawal:', {
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      stored_market_pda: offer.solana_bet_pool_pda,
      stored_lp_pda: offer.solana_position_pda,
      outcomeIndex,
      userBet_outcome: userBet.outcome,
    });

    // Check on-chain balance - use on-chain balance as source of truth
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const lpOfferPubkey = new PublicKey(offer.solana_position_pda || lpOfferPda);
    
    console.log('Checking on-chain balance:', {
      lpOfferPubkey: lpOfferPubkey.toBase58(),
      stored_pda: offer.solana_position_pda,
      derived_pda: lpOfferPda.toBase58(),
      dbUnmatchedAmount: withdrawAmount,
    });
    
    const accountInfo = await connection.getAccountInfo(lpOfferPubkey);
    const onChainBalance = (accountInfo?.lamports || 0) / 1e9;
    
    console.log('On-chain account info:', {
      exists: !!accountInfo,
      lamports: accountInfo?.lamports,
      balanceSol: onChainBalance,
      dbUnmatchedAmount: withdrawAmount,
    });
    
    // Use on-chain balance as the withdraw amount (DB may be out of sync)
    // Rent-exempt minimum on Solana is ~0.00000204 SOL, so if balance is less than 0.001, account is empty
    if (onChainBalance < 0.001) {
      return Response.json({ 
        error: 'No funds available on-chain. DB may be out of sync.',
        hint: `On-chain balance: ◎${onChainBalance.toFixed(6)}, DB shows: ◎${withdrawAmount.toFixed(4)}`
      }, { status: 400 });
    }
    
    // Withdraw the actual on-chain balance (minus small buffer for rent if needed)
    const actualWithdrawAmount = onChainBalance;
    
    console.log('Using on-chain balance as withdraw amount:', actualWithdrawAmount);
    
    return Response.json({
      success: true,
      userBetId,
      offerId: offer.id,
      amount: actualWithdrawAmount,
      solana_instruction: {
        instruction_type: 'withdraw_liquidity',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda,
      },
      message: `Sign to withdraw ◎${actualWithdrawAmount.toFixed(4)}`,
    });

  } catch (error) {
    console.error('withdrawLiquidity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});