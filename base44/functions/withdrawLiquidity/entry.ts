import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';
import { Buffer } from 'npm:buffer@6.0.3';

function getSolanaConfig() {
  const rpcUrl = Deno.env.get('SOLANA_RPC_URL');
  const programIdStr = Deno.env.get('ELEVENX_PROGRAM_ID');
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL secret not set');
  if (!programIdStr) throw new Error('ELEVENX_PROGRAM_ID secret not set');
  return { rpcUrl, programIdStr, programId: new PublicKey(programIdStr), connection: new Connection(rpcUrl, 'confirmed') };
}

/**
 * withdraw_liquidity instruction builder (LP withdraws unmatched liquidity)
 * Discriminator: [10, 224, 253, 15, 227, 173, 172, 25]
 * Data: discriminator only (no args)
 * Accounts: market, lp_offer, lp, system_program
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { programIdStr, programId, connection } = getSolanaConfig();

    const { walletAddress, userBetId, solana_position_pda, solana_market_pda } = await req.json();

    if (!walletAddress) return Response.json({ error: 'Wallet not connected' }, { status: 401 });

    const discriminator = Buffer.from([10, 224, 253, 15, 227, 173, 172, 25]);

    // --- Direct PDA path (futures on-chain positions with no DB record) ---
    if (!userBetId && solana_position_pda && solana_market_pda) {
      console.log('[withdrawLiquidity] Direct PDA path:', { solana_market_pda, solana_position_pda });
      const marketPdaPubkey = new PublicKey(solana_market_pda);
      const lpOfferPdaPubkey = new PublicKey(solana_position_pda);

      const accountInfo = await connection.getAccountInfo(lpOfferPdaPubkey);
      const onChainBalance = (accountInfo?.lamports || 0) / 1e9;
      if (onChainBalance < 0.001) {
        return Response.json({ error: 'No funds available on-chain' }, { status: 400 });
      }

      const keys = [
        { pubkey: marketPdaPubkey.toBase58(), isSigner: false, isWritable: true },
        { pubkey: lpOfferPdaPubkey.toBase58(), isSigner: false, isWritable: true },
        { pubkey: walletAddress, isSigner: false, isWritable: true },
        { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
      ];
      return Response.json({
        success: true, amount: onChainBalance,
        solana_instruction: {
          instruction_type: 'withdraw_liquidity',
          programId: programIdStr,
          keys,
          instruction_data: discriminator.toString('base64'),
        },
        message: `Sign to withdraw ◎${onChainBalance.toFixed(4)}`,
      });
    }

    // --- DB-backed path ---
    if (!userBetId) return Response.json({ error: 'Missing userBetId' }, { status: 400 });

    const userBets = await base44.entities.UserBet.filter({ id: userBetId });
    const userBet = userBets[0];
    if (!userBet) return Response.json({ error: 'UserBet not found' }, { status: 404 });
    if (userBet.role !== 'lp') return Response.json({ error: 'Not an LP bet' }, { status: 400 });

    let offer = null;
    // Don't check DB withdrawAmount - use on-chain balance instead
    if (userBet.offer_id) {
      const offers = await base44.entities.BetOffer.filter({ id: userBet.offer_id });
      offer = offers[0];
      if (!offer) {
        console.log('[withdrawLiquidity] Offer not found in DB, using UserBet data');
      }
    }

    const bets = await base44.entities.Bet.filter({ id: userBet.bet_id });
    if (!bets[0]) return Response.json({ error: 'Bet not found' }, { status: 400 });

    const lpPubkey = new PublicKey(walletAddress);
    const matchIdBytes = Buffer.alloc(32);
    Buffer.from(userBet.match_id, 'utf-8').copy(matchIdBytes, 0, 0, Math.min(userBet.match_id.length, 32));

    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchIdBytes], programId);
    const outcomeIndex = userBet.outcome === 'a' ? 0 : userBet.outcome === 'b' ? 1 : 2;
    const [lpOfferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_offer'), marketPda.toBuffer(), lpPubkey.toBuffer(), Buffer.from([outcomeIndex])], programId
    );

    const lpOfferPubkey = offer?.solana_position_pda ? new PublicKey(offer.solana_position_pda) : lpOfferPda;
    const accountInfo = await connection.getAccountInfo(lpOfferPubkey);
    const onChainBalance = (accountInfo?.lamports || 0) / 1e9;
    console.log('[withdrawLiquidity] On-chain balance:', onChainBalance, 'SOL');
    if (onChainBalance < 0.001) {
      return Response.json({ error: 'No funds available on-chain (may already be withdrawn)' }, { status: 400 });
    }

    console.log('[withdrawLiquidity] programId:', programIdStr);
    console.log('[withdrawLiquidity] Discriminator (hex):', discriminator.toString('hex'));

    // Accounts: market, lp_offer, lp [signer], system_program
    const keys = [
      { pubkey: marketPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: lpOfferPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: false, isWritable: true },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ];
    console.log('[withdrawLiquidity] Accounts:', keys.map((k, i) => `[${i}] ${k.pubkey}`));

    return Response.json({
      success: true, userBetId, offerId: offer?.id, amount: onChainBalance,
      solana_instruction: {
        instruction_type: 'withdraw_liquidity',
        programId: programIdStr,
        keys,
        instruction_data: discriminator.toString('base64'),
      },
      message: `Sign to withdraw ◎${onChainBalance.toFixed(4)}`,
    });
  } catch (error) {
    console.error('[withdrawLiquidity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});