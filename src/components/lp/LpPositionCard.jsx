import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTeamFlag } from '@/utils/flags';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock, CheckCircle, ArrowRight, Percent, CheckCircle2, Wallet, Trophy, Calendar, AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import BetCountdown from '@/components/betting/BetCountdown';
import WithdrawAmountModal from '@/components/lp/WithdrawAmountModal';
import { base44 } from '@/api/base44Client';
import { callBackendFunction } from '@/lib/directFunctionCall';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

/**
 * Derive lp_offer PDA from seeds: ["lp_offer", marketPda, lpWallet, [outcome]]
 */
function deriveLpOfferPda(marketPda, lpWallet, outcome) {
  try {
    const programId = new PublicKey(window.SOLANA_PROGRAM_ID || '3ecFdHPbcU88UQ37iStPcGaz7Bg16RdSDDYqW5FzPabu');
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('lp_offer'),
        new PublicKey(marketPda).toBuffer(),
        new PublicKey(lpWallet).toBuffer(),
        Buffer.from([outcome]),
      ],
      programId
    );
    return pda.toBase58();
  } catch (err) {
    console.error('[deriveLpOfferPda] Error:', err);
    return null;
  }
}

/**
 * Fetch on-chain lp_offer account and decode amounts + closed flag.
 * LpOffer layout after 8-byte discriminator:
 *   discriminator: 8 bytes (0-7)
 *   market: Pubkey (32) → offset 8-39
 *   lp: Pubkey (32) → offset 40-71
 *   outcome: u8 (1) → offset 72
 *   odds_bps: u64 (8) → offset 73-80
 *   amount_committed: u64 (8) → offset 81-88
 *   amount_matched: u64 (8) → offset 89-96
 *   closed: bool (1) → offset 97
 */
// Route through backend to avoid sandbox 403 on direct RPC calls
async function fetchLpOfferOnChain(positionPda) {
  try {
    console.log('[fetchLpOfferOnChain] Fetching via backend:', positionPda);
    const res = await base44.functions.invoke('fetchLpOfferOnChain', { pda: positionPda });
    const d = res.data;
    if (!d.exists) return null;
    return {
      amountCommitted: d.amountCommitted,
      amountMatched: d.amountMatched,
      unmatched: d.available,
      closed: d.closed,
    };
  } catch (err) {
    console.error('[fetchLpOfferOnChain] Error:', err.message);
    return null;
  }
}

/**
 * Fetch on-chain BetMarket account for settlement state.
 * Market layout:
 *   winning_outcome: u8 at offset 155 (0=unsettled, 1=a, 2=b, 3=draw)
 *   settled: bool at offset 276
 *   voided: bool at offset 277
 */
// Route through backend to avoid sandbox 403 on direct RPC calls
async function fetchMarketStateOnChain(marketPda) {
  try {
    const res = await base44.functions.invoke('solanaRpc', { action: 'getAccountInfo', params: { pubkey: marketPda } });
    const d = res.data;
    if (!d.exists) return null;
    const raw = Buffer.from(d.data_b64, 'base64');
    if (raw.length < 278) return null;
    const winningOutcomeRaw = raw[155];
    const settled = raw[276] === 1;
    const voided = raw[277] === 1;
    let winningOutcome = null;
    if (winningOutcomeRaw === 1) winningOutcome = 'a';
    else if (winningOutcomeRaw === 2) winningOutcome = 'b';
    else if (winningOutcomeRaw === 3) winningOutcome = 'draw';
    return { settled, voided, winningOutcome };
  } catch (err) {
    console.error('[fetchMarketStateOnChain] Error:', err.message);
    return null;
  }
}

export default function LpPositionCard({ position, match, bet, walletAddress, onWithdrawRequest }) {
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  // Support both BetOffer (offer) and UserBet (position) entities - DEFINE EARLY (but no early return yet)
  const offer = position;

  // Detect if this is a futures LP position
  const isFutures = offer?._isFutures || position?._isFutures || false;

  // Get market PDA and wallet from position data
  const marketPda = position?.solana_market_pda || position?.userBet?.solana_market_pda || bet?.solana_market_pda;
  const lpWallet = position?.wallet_address || offer?.lp_wallet_address;
  
  // Derive outcome number (1=a, 2=b, 3=draw)
  const outcomeNum = offer?.outcome === 'a' ? 1 : offer?.outcome === 'b' ? 2 : 3;
  
  // CRITICAL: Always derive positionPda from seeds if not explicitly provided
  const positionPda = position?.solana_position_pda || (marketPda && lpWallet ? deriveLpOfferPda(marketPda, lpWallet, outcomeNum) : null);
  
  console.log('[LpPositionCard] === PDA LOOKUP ===');
  console.log('[LpPositionCard] position.id:', position.id);
  console.log('[LpPositionCard] marketPda:', marketPda);
  console.log('[LpPositionCard] lpWallet:', lpWallet);
  console.log('[LpPositionCard] outcomeNum:', outcomeNum);
  console.log('[LpPositionCard] positionPda:', positionPda);
  console.log('[LpPositionCard] position.solana_position_pda:', position?.solana_position_pda);
  
  const { data: onChainOffer, refetch: refetchOnChain } = useQuery({
    queryKey: ['lp-offer-onchain', positionPda],
    queryFn: () => fetchLpOfferOnChain(positionPda),
    enabled: !!(positionPda && marketPda && lpWallet),
    staleTime: 2000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  
  console.log('[LpPositionCard] Query debug:', {
    positionPda,
    marketPda,
    lpWallet,
    enabled: !!(positionPda && marketPda && lpWallet),
    onChainOffer,
  });
  
  console.log('[LpPositionCard] === ON-CHAIN QUERY RESULT ===');
  console.log('[LpPositionCard] positionPda:', positionPda);
  console.log('[LpPositionCard] onChainOffer:', onChainOffer);
  console.log('[LpPositionCard] query enabled:', !!positionPda);
  
  const { data: onChainMarket } = useQuery({
    queryKey: ['market-state-onchain', marketPda],
    queryFn: () => fetchMarketStateOnChain(marketPda),
    enabled: !!marketPda,
    staleTime: 5000,
  });

  // Get match from position data if not passed
  const matchData = match || position.match || { team_a: 'Team A', team_b: 'Team B', team_a_flag: '', team_b_flag: '', group_stage: '', match_end_time: null, winner: '' };
  
  // CRITICAL: ALWAYS use on-chain data when available for accurate post-withdrawal balances
  const liquidityDeposited = onChainOffer 
    ? onChainOffer.amountCommitted 
    : (offer.liquidity_deposited || offer.amount_offered || 0);
  
  const liquidityMatched = onChainOffer 
    ? onChainOffer.amountMatched 
    : (offer.liquidity_matched || 0);
  
  // CRITICAL: On-chain unmatched is the ONLY source of truth after withdrawals
  const liquidityUnmatched = onChainOffer 
    ? onChainOffer.unmatched 
    : (offer.liquidity_unmatched !== undefined ? offer.liquidity_unmatched : Math.max(0, liquidityDeposited - liquidityMatched));
  
  console.log('[LpPositionCard] PARTIAL WITHDRAWAL CHECK:', {
    onChainOffer_exists: !!onChainOffer,
    onChainOffer,
    liquidityDeposited,
    liquidityMatched,
    liquidityUnmatched,
    dbStatus,
    isWithdrawn,
    isRefunded,
  });
  
  console.log('[LpPositionCard] === FINAL DISPLAY VALUES ===');
  console.log('[LpPositionCard] position.id:', position.id);
  console.log('[LpPositionCard] onChainOffer:', onChainOffer);
  console.log('[LpPositionCard] data source:', onChainOffer ? 'ON-CHAIN ✓' : 'DB FALLBACK');
  console.log('[LpPositionCard] liquidityDeposited:', liquidityDeposited, 'SOL');
  console.log('[LpPositionCard] liquidityMatched:', liquidityMatched, 'SOL');
  console.log('[LpPositionCard] liquidityUnmatched:', liquidityUnmatched, 'SOL');
  
  // Bug 2 Fix: Read settlement state from on-chain market, not DB
  const onChainSettled = onChainMarket?.settled === true;
  const onChainVoided = onChainMarket?.voided === true;
  const onChainWinningOutcome = onChainMarket?.winningOutcome;
  
  console.log('[LpPositionCard] ON-CHAIN DATA:', {
    position_id: position.id,
    onChainOffer,
    onChainMarket,
    liquidityDeposited,
    liquidityMatched,
    liquidityUnmatched,
  });

  // CRITICAL: Check UserBet status FIRST (settlement info), then BetOffer status (matching info)
  // userBet.status = settlement state (won/lost/claimed)
  // offer.status = matching state (open/partially_matched/fully_matched/withdrawn)
  const dbStatus = position.userBetStatus || position.userBet?.status || position.status || offer.status || 'active';
  const isVoided = dbStatus === 'void' || dbStatus === 'voided' || offer.status === 'void' || (matchData?.status === 'voided') || onChainWinningOutcome === 'void';
  
  console.log('===== [LpPositionCard] INPUT DATA =====');
  console.log('position.id:', position.id);
  console.log('position.userBetStatus:', position.userBetStatus);
  console.log('position.userBet?.status:', position.userBet?.status);
  console.log('offer.status:', offer.status);
  console.log('bet_winning_outcome:', position.bet_winning_outcome);
  console.log('match.winner:', matchData?.winner);
  console.log('liquidityMatched:', liquidityMatched);
  console.log('========================================');
  
  // Determine settlement from DB status OR from market result
  const isSettled = dbStatus === 'won' || dbStatus === 'lost' || dbStatus === 'settled' || 
                    (matchData?.winner && matchData.winner !== '');
  
  console.log('[LpPositionCard] Settlement check:', {
    dbStatus,
    match_winner: matchData?.winner,
    isSettled,
    offer_status: offer.status
  });
  
  // CRITICAL: VOIDED markets = LP LOSES (no payout, regardless of backend DB status)
  // CRITICAL: DB status is the ONLY source of truth for settled markets
  // settleBetWithOracle sets the correct status in the DB - frontend must trust it
  let isLpWon = false;
  let isLpLost = false;
  
  console.log('[LpPositionCard] RAW DATA:', { liquidityMatched, liquidityDeposited, liquidityUnmatched, dbStatus, offer_status: offer.status });
  
  // ALWAYS use DB status for settled markets - DO NOT calculate from winningOutcome
  if (dbStatus === 'won') {
    isLpWon = true;
    isLpLost = false;
    console.log('[LpPositionCard] LP WON (from DB status)');
  } else if (dbStatus === 'lost' || dbStatus === 'void' || dbStatus === 'voided') {
    isLpLost = true;
    isLpWon = false;
    console.log('[LpPositionCard] LP LOST/VOID (from DB status):', dbStatus);
  } else if (dbStatus === 'refunded' || dbStatus === 'withdrawn') {
    isLpWon = false;
    isLpLost = false;
    console.log('[LpPositionCard] LP REFUNDED/WITHDRAWN (from DB status)');
  } else if (liquidityMatched === 0 || liquidityMatched <= 0) {
    // No matched liquidity - neutral state
    isLpWon = false;
    isLpLost = false;
    console.log('[LpPositionCard] No matched liquidity - neutral');
  } else {
    // Fallback only if DB status is not set yet
    isLpWon = dbStatus === 'won';
    isLpLost = dbStatus === 'lost';
  }
  
  const isClaimed = dbStatus === 'claimed';
  const isRefunded = dbStatus === 'refunded';
  
  console.log('===== LP POSITION CARD DEBUG =====');
  console.log('Position ID:', position.id);
  console.log('liquidityMatched VALUE:', liquidityMatched, 'type:', typeof liquidityMatched);
  console.log('liquidityMatched === 0:', liquidityMatched === 0);
  console.log('RAW offer.status:', offer.status);
  console.log('RAW dbStatus:', dbStatus);
  console.log('==================================');
  // Withdrawn = unmatched liquidity already withdrawn (no bets were matched, so nothing left)
  // CRITICAL: Only consider withdrawn if on-chain closed OR truly zero unmatched on-chain
  const onChainClosed = onChainOffer?.closed === true;
  const onChainUnmatchedRaw = onChainOffer ? onChainOffer.unmatched : liquidityUnmatched;
  const isWithdrawn = (dbStatus === 'withdrawn' || offer.status === 'withdrawn') && (onChainUnmatchedRaw <= 0 || onChainClosed);

  console.log('[LpPositionCard] Win/Loss Check:', {
    position_id: position.id,
    userBet_status: position.userBet?.status,
    offer_status: offer.status,
    dbStatus,
    isLpWon,
    isLpLost,
    isSettled,
    liquidity_matched: liquidityMatched
  });

  console.log('[LpPositionCard] LP Win/Loss Check (using DB status):', {
    offer_id: offer.id,
    offer_status: offer.status,
    userBet_status: position.userBet?.status,
    dbStatus,
    isLpWon,
    isLpLost,
    isSettled,
    backed_outcome: offer.outcome,
    backed_label: offer.outcome_label
  });

  const matchPct = liquidityDeposited > 0 ?
  Math.round(liquidityMatched / liquidityDeposited * 100) :
  0;

  const hasUnmatched = liquidityUnmatched > 0;
  const isFullyMatched = offer.status === 'fully_matched' || offer.status === 'settled';
  const isPartiallyMatched = offer.status === 'partially_matched';
  const isOpen = offer.status === 'open';

  // Calculate potential earnings (2% fee on matched portion)
  const potentialEarnings = liquidityMatched * 0.02;

  // Calculate total value (deposited + fees earned)
  const totalValue = liquidityDeposited + potentialEarnings;

  const getOutcomeLabel = () => {
    // For futures: use outcome_label directly (e.g. "Team Alpha", "Team Beta", "Team Gamma")
    if (isFutures) {
      return offer.outcome_label || 'Unknown Outcome';
    }
    // For matches: use team names or Draw
    if (offer.outcome === 'a') return offer.outcome_label || matchData.team_a;
    if (offer.outcome === 'b') return offer.outcome_label || matchData.team_b;
    return 'Draw';
  };

  const statusConfig = {
    open: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30', label: 'Open' },
    partially_matched: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Partially Matched' },
    fully_matched: { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', label: 'Fully Matched' },
    withdrawn: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30', label: 'Withdrawn' },
    settled: { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', label: 'Settled' },
    won: { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', label: 'Won' },
    lost: { color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: 'Lost' },
    refunded: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30', label: 'Refunded' },
    void: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30', label: 'Void' },
    active: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', label: 'Active' },
    pending: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30', label: 'Pending' }
  };

  // Bug 2 Fix: Use ON-CHAIN settlement state as PRIMARY source
  // Status logic: voided==true → "Refunded"; settled==true → "Settled"; betting open & not settled → "Active"; betting closed & not settled → "Awaiting Result"
  let displayStatus = offer.status;
  
  console.log('[STATUS CALC] ON-CHAIN vs DB:', {
    onChainSettled,
    onChainVoided,
    onChainWinningOutcome,
    dbStatus,
    liquidityMatched,
  });
  
  // PRIORITY 1: On-chain voided = "Refunded" (regardless of DB)
  if (onChainVoided === true) {
    displayStatus = 'refunded';
    console.log('[STATUS CALC] On-chain VOIDED → refunded');
  }
  // PRIORITY 2: On-chain settled = "Settled" (use DB for won/lost/claimed)
  else if (onChainSettled === true) {
    // Use DB status for won/lost/claimed
    if (dbStatus === 'won' || dbStatus === 'lost' || dbStatus === 'claimed') {
      displayStatus = dbStatus;
      console.log('[STATUS CALC] On-chain settled + DB status →', displayStatus);
    } else {
      displayStatus = 'settled';
      console.log('[STATUS CALC] On-chain settled (no DB status) → settled');
    }
  }
  // PRIORITY 3: Betting closed (match ended) but not settled yet → "Awaiting Result"
  else if (matchData?.match_end_time && new Date(matchData.match_end_time) < new Date()) {
    displayStatus = 'pending';
    console.log('[STATUS CALC] Betting closed + not settled → awaiting_result');
  }
  // PRIORITY 4: Betting still open → "Active"
  else {
    displayStatus = 'active';
    console.log('[STATUS CALC] Betting open → active');
  }
  
  const currentStatus = statusConfig[displayStatus] || statusConfig.open;
  const displayStatusLabel = currentStatus.label || displayStatus.replace('_', ' ');
  console.log('[STATUS CALC] Final displayStatusLabel:', displayStatusLabel);

  // Handle withdraw confirmation - after user selects amount
  const handleWithdrawConfirm = async (selectedAmount) => {
    setShowWithdrawModal(false);

    if (!onWithdrawRequest) return;

    try {
      const userBetId = offer.userBetId || offer.id;
      console.log('[LpPositionCard] LP state:', { isLpWon, isLpLost, liquidityMatched, dbStatus, userBetId, isFutures });
      
      let res;
      
      let resData;

      if (isLpWon && liquidityMatched > 0) {
        console.log('[LpPositionCard] LP WON - calling withdrawLpWinnings');
        resData = await callBackendFunction('withdrawLpWinnings', { userBetId, walletAddress });
      } else if (positionPda && marketPda && !userBetId) {
        console.log('[LpPositionCard] On-chain withdraw (no DB record) - using PDA:', positionPda);
        resData = await callBackendFunction('withdrawLiquidity', {
          walletAddress,
          solana_position_pda: positionPda,
          solana_market_pda: marketPda,
        });
      } else {
        console.log('[LpPositionCard] Withdrawing unmatched liquidity - calling withdrawLiquidity');
        resData = await callBackendFunction('withdrawLiquidity', { userBetId, walletAddress });
      }

      if (resData?.error) {
        console.error('[LpPositionCard] Withdraw failed:', resData.error);
        alert('Withdraw failed:\n\n' + resData.error);
        return;
      }

      console.log('[LpPositionCard] Withdraw response:', resData);
      console.log('[LpPositionCard] Solana instruction:', resData.solana_instruction);

      onWithdrawRequest({
        solanaInstruction: resData.solana_instruction,
        withdrawAmount: selectedAmount,
        lpFeeBonus: resData.lpFeeBonus || 0,
        totalWithdraw: selectedAmount + (resData.lpFeeBonus || 0),
        positionId: offer.userBetId || offer.id,
        offerId: offer.offer_id || null,
        match: match,
        onSuccess: () => {
          setTimeout(() => refetchOnChain(), 2000);
        }
      });
    } catch (err) {
      console.error('[LpPositionCard] Withdraw failed:', err);
      alert('Withdraw failed:\n\n' + err.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden border border-white/10"
      style={{
        background: '#121212',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
      }}>
      
      {/* Glow orbs */}
      <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
      <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
      {/* Grid lines decoration */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#a69cf2 1px, transparent 1px), linear-gradient(90deg, #a69cf2 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Header - Outcome & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              {/* LP Side Indicator - Flag or Trophy */}
              <div className="relative">
                <div className={`absolute inset-0 blur-md rounded-full ${isFutures ? 'bg-yellow-500/20' : 'bg-primary/20'}`} />
                <div className={`relative bg-gradient-to-br border rounded-lg p-1.5 ${
                isFutures ?
                'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30' :
                'from-primary/20 to-primary/10 border-primary/30'}`
                }>
                  <span className="text-xl filter drop-shadow-md">
                    {isFutures
                      ? (offer.outcome_flag || position.outcome_flag || '🏆')
                      : offer.outcome === 'a'
                        ? (matchData.team_a_flag || getTeamFlag(matchData.team_a) || getTeamFlag(offer.outcome_label) || '🏳️')
                        : offer.outcome === 'b'
                          ? (matchData.team_b_flag || getTeamFlag(matchData.team_b) || getTeamFlag(offer.outcome_label) || '🏳️')
                          : '🤝'}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-sm sm:text-base text-white truncate">
                    {getOutcomeLabel()}
                  </h3>
                  {isFutures ?
                  <span className={`text-[9px] font-bold ${isFutures ? 'text-yellow-400' : 'text-primary/80'}`}>
                      {offer.outcome_label}
                    </span> :

                  <span className="text-[9px] text-primary/80 font-bold">
                      {offer.outcome === 'a' ? matchData.team_a : offer.outcome === 'b' ? matchData.team_b : 'Draw'}
                    </span>
                  }
                </div>
                <p className="text-[9px] sm:text-[10px] text-white/50 truncate">
                  {isFutures ? 'Tournament Market' : matchData.group_stage || 'World Cup 2026'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Grouped Transactions Badge */}
              {offer._groupedTransactions && offer._groupedTransactions.length > 1 && (
                <Badge className="bg-secondary/50 border-secondary/50 text-muted-foreground text-[8px] font-bold">
                  {offer._groupedTransactions.length} txs
                </Badge>
              )}
              {/* Type Badge - FUTURES vs MATCH */}
              <div className={`${
              isFutures ?
              'bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border-yellow-500/40 text-yellow-400' :
              'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30 text-primary'} border backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1`
              }>
                {isFutures ?
                <>
                    <Trophy className="w-2.5 h-2.5" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Futures</span>
                  </> :

                <>
                    <Calendar className="w-2.5 h-2.5" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Match</span>
                  </>
                }
              </div>
              <Badge className={`${currentStatus.bg} ${currentStatus.border} ${currentStatus.color} text-[9px] sm:text-[10px] font-bold border`}>
                {displayStatusLabel}
              </Badge>
            </div>
            {!isFutures && matchData.match_end_time &&
            <BetCountdown openUntil={matchData.match_end_time} label="Betting closes" className="text-[8px]" />
            }
          </div>
        </div>

        {/* Stats Grid - 2x2 with Fees */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm rounded-xl p-2.5 border border-primary/20">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-2.5 h-2.5 text-primary" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Deposited</span>
            </div>
            <p className="font-heading font-bold text-primary text-xs sm:text-sm">
              ◎{liquidityDeposited.toFixed(4)}
            </p>
          </div>

          <div className="bg-gradient-to-br from-accent/10 to-accent/5 backdrop-blur-sm rounded-xl p-2.5 border border-accent/20">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="w-2.5 h-2.5 text-accent" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Fees Earned</span>
            </div>
            <p className="font-heading font-bold text-accent text-xs sm:text-sm">
              ◎{potentialEarnings.toFixed(4)}
            </p>
          </div>

          <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-sm rounded-xl p-2.5 border border-emerald-500/20">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Matched</span>
            </div>
            <p className="font-heading font-bold text-emerald-400 text-xs sm:text-sm">
              ◎{liquidityMatched.toFixed(4)}
            </p>
          </div>

          <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 backdrop-blur-sm rounded-xl p-2.5 border border-yellow-500/20">
            <div className="flex items-center gap-1 mb-1">
              <Wallet className="w-2.5 h-2.5 text-yellow-400" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Available</span>
            </div>
            <p className="font-heading font-bold text-yellow-400 text-xs sm:text-sm">
              ◎{liquidityUnmatched.toFixed(4)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="pt-2 border-t border-white/10">

          <div className="flex items-center justify-between text-[8px] sm:text-[10px] text-white/40 mb-1.5">
            <span>Match Rate</span>
            <span className="font-bold text-white/60">{matchPct}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
              isFullyMatched ? 'bg-gradient-to-r from-accent to-emerald-400' :
              isPartiallyMatched ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
              'bg-gradient-to-r from-primary/50 to-primary'}`
              }
              style={{ width: `${matchPct}%` }} />
            
          </div>
        </div>

        {/* LP Result Indicator - Use ON-CHAIN state as primary source */}
        {(() => {
          console.log('[LpPositionCard] Rendering LP Result:', {
            onChainSettled,
            onChainVoided,
            onChainWinningOutcome,
            liquidityMatched,
            dbStatus,
          });
          
          // PRIORITY 1: On-chain voided = LP loses (funds to DAO)
          if (onChainVoided === true) {
            return (
              <div className="px-3 py-2 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">💸 Market Voided (LP Lost)</span>
                  <span className="text-white/40">Funds to DAO</span>
                </div>
              </div>
            );
          }
          
          // PRIORITY 2: DB status = lost/void (fallback if on-chain not available)
          if (dbStatus === 'lost' || dbStatus === 'void' || dbStatus === 'voided') {
            return (
              <div className="px-3 py-2 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">💸 {dbStatus === 'void' || dbStatus === 'voided' ? 'Market Voided' : 'LP Position Lost'}</span>
                  <span className="text-white/40">{dbStatus === 'void' || dbStatus === 'voided' ? 'Funds to DAO' : 'Backed winner ✗'}</span>
                </div>
              </div>
            );
          }
          
          // PRIORITY 3: On-chain settled → check win/loss
          if (onChainSettled === true) {
            // Determine if LP won or lost based on backed outcome vs winning outcome
            const lpBackedOutcome = offer.outcome; // 'a', 'b', or 'draw'
            const didLpWin = onChainWinningOutcome && lpBackedOutcome !== onChainWinningOutcome;
            const didLpLose = onChainWinningOutcome && lpBackedOutcome === onChainWinningOutcome;
            
            if (didLpWin) {
              return (
                <div className="px-3 py-2 rounded-lg border bg-accent/10 border-accent/30 text-accent">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="font-bold uppercase tracking-wider">🎉 LP Position Won</span>
                    <span className="text-white/40">Backed loser ✓</span>
                  </div>
                </div>
              );
            } else if (didLpLose) {
              return (
                <div className="px-3 py-2 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="font-bold uppercase tracking-wider">💸 LP Position Lost</span>
                    <span className="text-white/40">Backed winner ✗</span>
                  </div>
                </div>
              );
            }
          }
          
          // PRIORITY 4: No matched liquidity → show unmatched status (NOT "Refunded")
          if (liquidityMatched === 0 || liquidityMatched <= 0) {
            return (
              <div className="px-3 py-2 rounded-lg border bg-secondary/10 border-secondary/30 text-muted-foreground">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">ℹ️ Unmatched</span>
                  <span className="text-white/40">No bets matched yet</span>
                </div>
              </div>
            );
          }
          
          // PRIORITY 5: Market still open with matched liquidity → no result yet
          return null;
        })()}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-white/10">
          {(() => {
            // CRITICAL: Use aggregated userBetStatus from dashboard (prioritizes claimed/withdrawn over pending/active)
            // This fixes the issue where old pending transactions show claim/withdraw buttons after claiming
            const userBetStatus = position.userBetStatus || position.userBet?.status || position.status;
            const offerStatus = offer.status;
            const alreadyClaimed = userBetStatus === 'claimed';
            
            console.log('[LpPositionCard] Claim check (using aggregated status):', {
              userBetStatus,
              userBetStatus_source: position.userBetStatus ? 'aggregated_from_dashboard' : 'fallback_to_position',
              position_userBet_status: position.userBet?.status,
              position_status: position.status,
              offer_status: offerStatus,
              alreadyClaimed
            });
            
            // Priority 0: VOIDED markets - only block if matched (unmatched is still withdrawable)
            // When market is voided, matched funds go to DAO, but unmatched LP funds can be withdrawn
            if (isVoided && liquidityMatched > 0) {
              return (
                <div className="flex-1 flex items-center justify-between bg-destructive/15 border border-destructive/40 rounded-xl px-3 h-9">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-[11px] font-heading font-bold text-destructive uppercase tracking-wider">Market Voided</span>
                  </div>
                  <span className="font-heading font-black text-sm text-destructive/70">◎0.0000</span>
                </div>);

            }

            // Priority 0: Refunded/Withdrawn - but STILL allow unmatched withdrawal
            // Only show "Withdrawn" badge if there's NO unmatched liquidity left on-chain
            const onChainClosed = onChainOffer?.closed === true;
            const onChainUnmatchedForCheck = onChainOffer ? onChainOffer.unmatched : liquidityUnmatched;
            
            // CRITICAL: Only show "Withdrawn" badge if on-chain closed OR truly zero unmatched
            // This fixes partial withdrawal bug - don't block withdrawal if there's still unmatched liquidity
            if (liquidityMatched === 0 && (isRefunded || isWithdrawn || userBetStatus === 'refunded' || userBetStatus === 'withdrawn')) {
              // If there's still unmatched on-chain AND not closed, show withdraw button instead
              if (onChainUnmatchedForCheck > 0 && onWithdrawRequest && !onChainClosed) {
                // Fall through to unmatched withdrawal logic below
                console.log('[LpPositionCard] Partial withdrawal detected - showing withdraw button for remaining:', onChainUnmatchedForCheck);
              } else if (onChainUnmatchedForCheck <= 0 || onChainClosed) {
                // Truly withdrawn - no liquidity left or on-chain closed
                return (
                  <div className="flex-1 flex flex-col gap-1">
                    <Button
                      disabled
                      variant="outline"
                      className="w-full h-8 text-[10px] sm:text-xs border-white/10 text-white/40 bg-white/5 rounded-xl font-heading font-bold">
                      
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Withdrawn ◎{((offer.liquidity_deposited || 0) - (onChainUnmatchedForCheck || 0)).toFixed(4)}
                    </Button>
                  </div>);
              }
            }

            // Priority 1: Already claimed (MATCHED positions only)
            // Use aggregated userBetStatus to prevent old records from showing claim buttons
            if ((alreadyClaimed || userBetStatus === 'claimed') && liquidityMatched > 0) {
              const claimedAmount = liquidityMatched + potentialEarnings;
              return (
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex-1 flex items-center justify-between bg-accent/15 border border-accent/40 rounded-xl px-3 h-9">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                      <span className="text-[11px] font-heading font-bold text-accent uppercase tracking-wider">Claimed</span>
                    </div>
                    <span className="font-heading font-black text-sm text-accent">◎{claimedAmount.toFixed(4)}</span>
                  </div>
                </div>);

            }

            // Priority 2: LP LOST with matched liquidity - show loss but STILL allow unmatched withdrawal
            const hasUnmatchedLiquidity = liquidityUnmatched > 0;
            
            if ((isLpLost || isVoided) && liquidityMatched > 0) {
              // If there's unmatched liquidity, show withdraw button instead of "lost" message
              if (hasUnmatchedLiquidity && userBetStatus !== 'refunded' && userBetStatus !== 'withdrawn') {
                // Fall through to unmatched withdrawal logic below
              } else {
                return (
                  <div className="flex-1 flex items-center justify-between bg-destructive/15 border border-destructive/40 rounded-xl px-3 h-9">
                    <div className="flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-[11px] font-heading font-bold text-destructive uppercase tracking-wider">
                        {isVoided ? 'Market Voided' : 'Position Lost'}
                      </span>
                    </div>
                    <span className="font-heading font-black text-sm text-destructive/70">◎0.0000</span>
                  </div>);
              }
            }

            // Priority 3: LP WON with matched liquidity - claim winnings (matched stake + fees)
            // Use aggregated userBetStatus to prevent already-claimed positions from showing claim buttons
            if (isLpWon && liquidityMatched > 0 && userBetStatus !== 'claimed' && !alreadyClaimed && onWithdrawRequest) {
              const claimAmount = liquidityMatched + liquidityMatched * 0.02; // stake + 2% fees
              return (
                <Button
                  onClick={() => setShowWithdrawModal(true)}
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs text-black rounded-xl font-heading font-bold"
                  style={{ background: 'linear-gradient(135deg, #14f195, #00ff87)' }}>
                  
                  <Trophy className="w-3 h-3 mr-1" />
                  Claim ◎{claimAmount.toFixed(4)}
                </Button>);

            }

            // Priority 4: Has unmatched liquidity - withdraw unmatched (only if on-chain closed == false)
            // CRITICAL: Never show withdraw if on-chain closed flag is true (AlreadyWithdrawn error)
            const onChainUnmatched = onChainOffer ? onChainOffer.unmatched : liquidityUnmatched;
            const canWithdrawUnmatched = (onChainOffer ? (onChainUnmatched > 0 && !onChainClosed) : hasUnmatchedLiquidity) && 
                                         userBetStatus !== 'refunded' && 
                                         userBetStatus !== 'withdrawn' &&
                                         onWithdrawRequest;

            // If on-chain says already closed, show Withdrawn badge with amount withdrawn
            if (onChainClosed) {
              const withdrawnAmount = (offer.liquidity_withdrawn || 0) + (offer.liquidity_deposited || 0) - (offer.liquidity_unmatched || 0);
              return (
                <div className="flex-1 flex flex-col gap-1">
                  <Button
                    disabled
                    variant="outline"
                    className="w-full h-8 text-[10px] sm:text-xs border-white/10 text-white/40 bg-white/5 rounded-xl font-heading font-bold">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Withdrawn ◎{((offer.liquidity_deposited || 0) - (offer.liquidity_unmatched || 0)).toFixed(4)}
                  </Button>
                </div>
              );
            }

            if (canWithdrawUnmatched) {
              return (
                <Button
                  onClick={() => setShowWithdrawModal(true)}
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 rounded-xl font-heading font-bold bg-[#242424]">
                  
                  <Wallet className="w-3 h-3 mr-1" />
                  Withdraw ◎{onChainUnmatched.toFixed(4)}
                  {onChainUnmatched < liquidityUnmatched && (
                    <span className="text-[8px] ml-1 opacity-60">(on-chain)</span>
                  )}
                </Button>);
            }

            // Position not yet settled
            if (!isSettled) {
              return (
                <Button
                  disabled
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-border/30 text-muted-foreground bg-secondary/10 rounded-xl font-heading font-bold">
                  
                  <Clock className="w-3 h-3 mr-1" />
                  Pending Settlement
                </Button>);

            }

            // Fallback: settled but no action needed
            return (
              <Button
                disabled
                variant="outline"
                className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-accent/30 text-accent bg-accent/10 rounded-xl font-heading font-bold">
                
                <CheckCircle className="w-3 h-3 mr-1" />
                Settled
              </Button>);

          })()}
          
          <Link to={`/match/${offer.match_id}`} className="flex-1">
            <Button
              variant="outline"
              className="w-full h-8 sm:h-9 text-[10px] sm:text-xs border-border/50 text-white/70 hover:text-white hover:bg-white/5 rounded-xl font-heading font-bold">
              
              View Market
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Withdraw Amount Modal */}
      <WithdrawAmountModal
        open={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        maxAmount={liquidityUnmatched}
        title="Withdraw Liquidity"
        onConfirm={handleWithdrawConfirm}
        isLoading={false}
      />
    </motion.div>);

}