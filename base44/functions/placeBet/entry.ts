import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * place_bet instruction builder
 * Discriminator: [222, 62, 67, 220, 63, 166, 126, 33]
 * Data: discriminator + outcome (u8) + amount (u64 LE)
 * Accounts: market, lp_offer, bet_position, bettor, system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    const { programIdStr, programId } = getSolanaConfig();

    const { walletAddress, bet_id, match_id, outcome, amount: rawAmount } = await req.json();
    const amount = parseFloat(rawAmount);

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });
    if (!bet_id || !match_id || outcome === undefined || rawAmount === undefined || rawAmount === null || rawAmount === '') {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (isNaN(amount) || amount <= 0) return Response.json({ error: 'Amount must be a positive number' }, { status: 400 });
    if (outcome !== 'a' && outcome !== 'b' && outcome !== 'draw') {
      return Response.json({ error: 'Invalid outcome' }, { status: 400 });
    }

    const bets = await serviceRole.entities.Bet.filter({ id: bet_id });
    const bet = bets[0];
    if (!bet || bet.status !== 'open') {
      return Response.json({ error: 'Bet not open' }, { status: 400 });
    }

    const outcomeIndex = outcome === 'a' ? 0 : outcome === 'b' ? 1 : 2;
    const outcomeLabel = outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw';

    const existingOffers = await serviceRole.entities.BetOffer.filter({
      bet_id, match_id, outcome, status: { $in: ['open', 'partially_matched'] }
    });
    const validOffers = existingOffers.filter(o => (o.amount_unmatched || 0) > 0);
    if (validOffers.length === 0) {
      return Response.json({ error: 'No liquidity available for this outcome' }, { status: 400 });
    }
    const bestOffer = validOffers.reduce((best, cur) =>
      (cur.amount_unmatched || 0) > (best.amount_unmatched || 0) ? cur : best, validOffers[0]);

    const bettorPubkey = new PublicKey(walletAddress);
    const lpPubkey = new PublicKey(bestOffer.lp_wallet_address);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])], programId
    );
    const [bettorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), bettorPubkey.toBuffer(), Buffer.from([outcomeIndex])], programId
    );

    const oddsDecimal = bestOffer.odds_at_creation || 2.0;
    const potentialPayout = amount * oddsDecimal;
    const amountLamports = Math.round(amount * 1_000_000_000);

    const discriminator = Buffer.from([222, 62, 67, 220, 63, 166, 126, 33]);
    const instructionData = Buffer.alloc(17);
    discriminator.copy(instructionData, 0);
    instructionData.writeUInt8(outcomeIndex, 8);
    instructionData.writeBigUInt64LE(BigInt(amountLamports), 9);

    console.log('[placeBet] programId:', programIdStr);
    console.log('[placeBet] Discriminator (hex):', discriminator.toString('hex'));
    console.log('[placeBet] Amount (lamports):', amountLamports);

    // Accounts: market, lp_offer, bet_position, bettor [signer], system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: lpOfferPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: bettorPositionPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: true, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];
    console.log('[placeBet] Accounts:', keys.map((k, i) => `[${i}] ${k.pubkey}`));

    const matches = await serviceRole.entities.Match.filter({ id: match_id });
    const match = matches[0];

    const commit_data = {
      userBet: {
        bet_id, match_id, offer_id: bestOffer.id, outcome, amount,
        role: 'matcher', status: 'active', outcome_label: outcomeLabel,
        match_title: match ? `${match.team_a} vs ${match.team_b}` : '',
        potential_payout: potentialPayout, wallet_address: walletAddress,
      },
      offerUpdate: {
        offer_id: bestOffer.id,
        amount_matched: (bestOffer.amount_matched || 0) + amount,
        amount_unmatched: (bestOffer.amount_unmatched || 0) - amount,
        status: ((bestOffer.amount_unmatched || 0) - amount) <= 0.0001 ? 'fully_matched' : 'partially_matched',
      },
    };

    return Response.json({
      success: true, amount, odds: oddsDecimal, potentialPayout,
      lp_offer_id: bestOffer.id, commit_data,
      solana_instruction: {
        instruction_type: 'place_bet',
        programId: programIdStr,
        keys,
        instruction_data: instructionData.toString('base64'),
      },
    });
  } catch (error) {
    console.error('[placeBet] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});