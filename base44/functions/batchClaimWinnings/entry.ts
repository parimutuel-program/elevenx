import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'node:buffer';

const SOLANA_PROGRAM_ID = Deno.env.get('SOLANA__PROGRAM_ID') || 'PMut1111111111111111111111111111111111111111';

/**
 * Batch claim winnings for all won bets on a specific match.
 * Uses wallet-only authentication (no email login required).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;

    const { matchId, walletAddress } = await req.json();
    
    if (!matchId) {
      return Response.json({ error: 'Missing matchId' }, { status: 400 });
    }

    if (!walletAddress) {
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    // Validate wallet format
    const trimmedWallet = walletAddress.trim();
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmedWallet)) {
      return Response.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    // Verify wallet is authenticated (exists in WalletUser entity)
    const allWalletUsers = await serviceRole.entities.WalletUser.list();
    const walletUser = allWalletUsers.find(wu => wu.wallet_address === trimmedWallet);
    
    if (!walletUser) {
      return Response.json({ 
        error: 'Wallet not authenticated. Please connect your wallet first.',
        hint: 'Connect your Phantom wallet on the Profile page'
      }, { status: 401 });
    }

    // Get all user's won bets for this match - filter by wallet_address
    const allUserBets = await serviceRole.entities.UserBet.filter({ match_id: matchId });
    const wonBets = allUserBets.filter(
      ub => ub.wallet_address === trimmedWallet && ub.status === 'won'
    );

    if (wonBets.length === 0) {
      return Response.json({ error: 'No won bets found for this match' }, { status: 400 });
    }

    // Calculate total payout
    const totalPayout = wonBets.reduce((sum, bet) => sum + (bet.actual_payout || bet.potential_payout || 0), 0);

    const bettorPubkey = new PublicKey(trimmedWallet);
    const programId = new PublicKey(SOLANA_PROGRAM_ID);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(matchId, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(matchId.length, 32));

    // Get market PDA (same for all bets on this match)
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), matchIdBytes],
      programId
    );

    const [feeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault')],
      programId
    );

    console.log(`✓ Batch Claim: wallet=${trimmedWallet.slice(0, 8)}... | match=${matchId} | bets=${wonBets.length} | total=${totalPayout} SOL`);

    return Response.json({
      success: true,
      message: `Sign to claim ${wonBets.length} winning bet(s) from this match`,
      totalPayout,
      betCount: wonBets.length,
      betIds: wonBets.map(b => b.id),
      solana_instruction: {
        instruction_type: 'claim_winnings',
        programId: SOLANA_PROGRAM_ID,
        marketPda: marketPda.toBase58(),
        positionPda: marketPda.toBase58(), // Program handles all positions for this user/market
        feeVaultPda: feeVaultPda.toBase58(),
        bettorPubkey: trimmedWallet,
      },
    });

  } catch (error) {
    console.error('batchClaimWinnings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});