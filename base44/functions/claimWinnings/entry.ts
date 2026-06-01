import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA_PROGRAM_ID') || 'YOUR_PROGRAM_ID_HERE';

/**
 * Prepare claim_winnings instruction for the winning bettor.
 * In the hybrid fixed-odds model, payout = potential_payout (minus 2% fee).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { userBetId } = await req.json();
    if (!userBetId) return Response.json({ error: 'Missing userBetId' }, { status: 400 });

    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) return Response.json({ error: 'Bet not found' }, { status: 404 });
    if (userBet.created_by_id !== user.id) return Response.json({ error: 'Unauthorized' }, { status: 403 });
    if (userBet.status !== 'won') return Response.json({ error: 'Bet is not won' }, { status: 400 });

    // Gross payout = potential_payout. Net = gross − 2% fee.
    const gross     = userBet.potential_payout || 0;
    const fee       = gross * 0.02;
    const netPayout = gross - fee;

    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    const bet  = bets[0];
    if (!bet) return Response.json({ error: 'Bet not found' }, { status: 400 });

    const walletAddress = user.wallet_address;
    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 400 });

    const bettorPubkey = new PublicKey(walletAddress);
    const programId    = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

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

    console.log(`✓ Claim: user=${user.id} | gross=◎${gross.toFixed(4)} | fee=◎${fee.toFixed(4)} | net=◎${netPayout.toFixed(4)}`);

    return Response.json({
      success: true,
      gross,
      fee,
      netPayout,
      message: `Sign to claim ◎${netPayout.toFixed(4)} (◎${fee.toFixed(4)} fee deducted)`,
      solana_instruction: {
        instruction_type: 'claim_winnings',
        marketPda:    marketPda.toBase58(),
        positionPda:  positionPda.toBase58(),
        feeVaultPda:  feeVaultPda.toBase58(),
        bettorPubkey: walletAddress,
        netPayoutLamports: Math.round(netPayout * 1_000_000_000),
      },
    });

  } catch (error) {
    console.error('claimWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});