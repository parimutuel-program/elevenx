import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

// Withdraw unmatched liquidity from an LP position (UserBet entity)
// Only the LP can withdraw, only the unmatched portion

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { userBetId, walletAddress } = body;

    if (!userBetId) return Response.json({ error: 'userBetId required' }, { status: 400 });
    if (!walletAddress) return Response.json({ error: 'walletAddress required' }, { status: 400 });

    // Get the LP position
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) return Response.json({ error: 'UserBet not found' }, { status: 404 });

    // Verify wallet ownership
    if (userBet.wallet_address !== walletAddress) {
      return Response.json({ error: 'Not your LP position' }, { status: 403 });
    }

    // Can only withdraw LP positions with unmatched liquidity
    if (userBet.role !== 'lp') {
      return Response.json({ error: 'Not an LP position' }, { status: 400 });
    }

    // Calculate unmatched amount
    const unmatchedAmount = userBet.liquidity_unmatched || 0;
    if (unmatchedAmount <= 0) {
      return Response.json({ error: 'No unmatched liquidity to withdraw' }, { status: 400 });
    }

    // Get match and bet data
    const matches = await base44.entities.Match.filter({ id: userBet.match_id });
    const match = matches[0];
    if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 404 });

    // Get Solana program ID and derive PDAs
    const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID');
    if (!SOLANA_PROGRAM_ID) {
      return Response.json({ error: 'Solana program ID not configured' }, { status: 500 });
    }

    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const lpPubkey = new PublicKey(walletAddress);
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;

    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])],
      programId
    );

    const amountLamports = Math.round(unmatchedAmount * 1_000_000_000);

    console.log('[withdrawUnmatchedLiquidity] Preparing withdraw instruction:', {
      userBetId,
      unmatchedAmount,
      marketPda: marketPda.toBase58(),
      lpOfferPda: lpOfferPda.toBase58(),
      amountLamports,
    });

    return Response.json({
      success: true,
      amount: unmatchedAmount,
      userBetId,
      solana_instruction: {
        instruction_type: 'withdraw_liquidity',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        lpOfferPda: lpOfferPda.toBase58(),
        amountLamports,
      },
      message: `✓ Ready to withdraw ◎${unmatchedAmount.toFixed(4)} unmatched liquidity`,
    });
  } catch (error) {
    console.error('[withdrawUnmatchedLiquidity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});