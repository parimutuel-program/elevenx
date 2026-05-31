import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.wallet_address) {
      return Response.json({ error: 'Wallet not connected' }, { status: 400 });
    }

    const { userBetId } = await req.json();

    if (!userBetId) {
      return Response.json({ error: 'Missing userBetId' }, { status: 400 });
    }

    // Get the user bet
    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];

    if (!userBet) {
      return Response.json({ error: 'Bet not found' }, { status: 404 });
    }

    // Verify ownership
    if (userBet.created_by_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if bet is won and not yet claimed
    if (userBet.status !== 'won') {
      return Response.json({ error: 'Bet is not won yet' }, { status: 400 });
    }

    // In a real implementation, this would trigger a smart contract payout
    // For now, we'll just mark it as claimed
    await base44.entities.UserBet.update(userBetId, {
      status: 'claimed',
    });

    // In production: Call smart contract to release funds to user's wallet
    // const contractResult = await callSmartContract('claimWinnings', { userBetId, walletAddress: user.wallet_address });

    return Response.json({
      success: true,
      message: 'Winnings claimed successfully',
      payout: userBet.actual_payout || userBet.potential_payout
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});