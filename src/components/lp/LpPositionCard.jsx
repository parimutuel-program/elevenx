import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock, CheckCircle, ArrowRight, Percent, CheckCircle2, Wallet, Trophy, Calendar, AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import BetCountdown from '@/components/betting/BetCountdown';
import { base44 } from '@/api/base44Client';

export default function LpPositionCard({ position, match, bet, walletAddress, onWithdrawRequest }) {
  // Support both BetOffer (offer) and UserBet (position) entities
  const offer = position;
  if (!offer) return null;

  // Detect if this is a futures LP position
  const isFutures = offer._isFutures || position._isFutures || false;

  // Get match from position data if not passed - ALWAYS use matchData, never match directly
  const matchData = match || position.match || { team_a: 'Team A', team_b: 'Team B', team_a_flag: '', team_b_flag: '', group_stage: '', match_end_time: null, winner: '' };
  
  // Get winning outcome from Bet entity (match.winner is often empty)
  const winningOutcome = offer.bet_winning_outcome || matchData.winner || '';

  // Handle both BetOffer and UserBet structures - use amount as fallback for parimutuel LP
  // CRITICAL: For futures, prefer amount_offered/amount_matched over liquidity_* fields
  // Support grouped transactions - use total_* fields if available, otherwise fall back to individual fields
  const liquidityDeposited = isFutures 
    ? (offer.amount_offered || offer.total_liquidity_deposited || offer.liquidity_deposited || 0) 
    : (offer.total_liquidity_deposited || offer.liquidity_deposited || offer.amount_offered || offer.amount || 0);
  const liquidityMatched = isFutures 
    ? (offer.amount_matched || offer.total_liquidity_matched || offer.liquidity_matched || 0) 
    : (offer.total_liquidity_matched || offer.liquidity_matched || offer.amount_matched || 0);
  const liquidityUnmatched = isFutures 
    ? (offer.amount_unmatched || offer.total_liquidity_unmatched || offer.liquidity_unmatched || 0) 
    : (offer.total_liquidity_unmatched || offer.liquidity_unmatched || offer.amount_unmatched || 0);

  // CRITICAL: Check UserBet status FIRST (settlement info), then BetOffer status (matching info)
  // userBet.status = settlement state (won/lost/claimed)
  // offer.status = matching state (open/partially_matched/fully_matched/withdrawn)
  const dbStatus = position.userBetStatus || position.userBet?.status || position.status || offer.status || 'active';
  const isVoided = dbStatus === 'void' || dbStatus === 'voided' || offer.status === 'void' || (matchData?.status === 'voided') || winningOutcome === 'void';
  
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
  const isWithdrawn = dbStatus === 'withdrawn' || offer.status === 'withdrawn' ||
  dbStatus === 'refunded' ||
  liquidityUnmatched === 0 && liquidityDeposited > 0 && liquidityMatched === 0 && (dbStatus === 'active' || dbStatus === 'pending') && offer.status === 'withdrawn';

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

  // CRITICAL: DB status is the ONLY source of truth - trust what settleBetWithOracle set
  let displayStatus = offer.status;
  
  console.log('[STATUS CALC] dbStatus:', dbStatus, 'isSettled:', isSettled);
  
  // ALWAYS use DB status directly for settled markets
  if (dbStatus === 'won' || dbStatus === 'lost' || dbStatus === 'void' || dbStatus === 'voided' || dbStatus === 'refunded' || dbStatus === 'withdrawn' || dbStatus === 'claimed') {
    displayStatus = dbStatus;
    console.log('[STATUS CALC] Using DB status directly:', displayStatus);
  } else if (liquidityMatched === 0) {
    displayStatus = 'refunded';
    console.log('[STATUS CALC] No matched liquidity - refunded');
  } else {
    // Fallback for unsettled markets
    displayStatus = offer.status;
  }
  
  const currentStatus = statusConfig[displayStatus] || statusConfig.open;
  const displayStatusLabel = currentStatus.label || displayStatus.replace('_', ' ');
  console.log('[STATUS CALC] Final displayStatusLabel:', displayStatusLabel);

  // Handle withdraw click - fetch match data and prepare withdraw instruction
  const handleWithdraw = async () => {
    if (!onWithdrawRequest) return;

    try {
      const userBetId = offer.userBetId || offer.id;
      const hasMatchedInDb = offer.amount_matched > 0 || offer.liquidity_matched > 0;
      const isSettled = offer.status === 'settled';

      // Determine which withdraw function to call based on DB state (no pre-check needed)
      let withdrawFn;
      if ((hasMatchedInDb) && isLpWon) {
        withdrawFn = 'withdrawLpWinnings';
      } else if (hasUnmatched || offer.liquidity_unmatched > 0) {
        withdrawFn = 'withdrawUnmatchedLiquidity';
      } else if (isSettled && isLpWon) {
        withdrawFn = 'withdrawLpWinnings';
      } else {
        throw new Error('No withdrawable funds. LP position lost or has no unmatched liquidity.');
      }

      // Run on-chain check and withdraw call in parallel
      const [checkRes, res] = await Promise.all([
        base44.functions.invoke('checkLpOfferOnChain', { userBetId }),
        withdrawFn === 'withdrawUnmatchedLiquidity'
          ? base44.functions.invoke('withdrawUnmatchedLiquidity', { userBetId, walletAddress })
          : base44.functions.invoke('withdrawLpWinnings', { userBetId })
      ]);

      // Block if on-chain check says can't claim
      if (!checkRes.data.canClaim) {
        let userMessage = checkRes.data.error || 'Cannot withdraw';
        if (checkRes.data.reason === 'already_withdrawn') {
          userMessage = 'This LP position has already been withdrawn on-chain.';
        } else if (checkRes.data.reason === 'not_found_on_chain') {
          userMessage = 'LP position not found on-chain. The market may not be deployed.';
        }
        alert('Cannot withdraw:\n\n' + userMessage);
        return;
      }

      // Handle HTTP errors (400, 404, 500, etc.)
      if (res.status !== 200 || res.data?.error) {
        const errorMsg = res.data?.error || res.statusText || 'Unknown error';
        console.error('[LpPositionCard] Withdraw failed:', {
          status: res.status,
          error: errorMsg,
          data: res.data
        });

        let userMessage = errorMsg;
        if (errorMsg.includes('did not win') || errorMsg.includes('LP position did not win')) {
          userMessage = 'This LP position did not win. In parimutuel betting, LPs profit when bettors lose.\n\nYour backed outcome won, so the LP position lost value.';
        } else if (errorMsg.includes('Market has not been settled')) {
          userMessage = 'Market must be settled before claiming. Wait for admin to settle the market.';
        } else if (errorMsg.includes('auto-voided') || errorMsg.includes('no bets on winning outcome')) {
          userMessage = '⚠️ Market Auto-Voided\n\nNo one bet on the winning outcome, so the market was automatically voided.\n\nYour unmatched liquidity can still be withdrawn - use "Withdraw Unmatched" instead.';
        } else if (errorMsg.includes('No unmatched liquidity')) {
          userMessage = 'No unmatched liquidity available. All funds are locked in matched positions.';
        } else if (errorMsg.includes('Only LP positions')) {
          userMessage = 'Only LP positions can withdraw winnings. This appears to be a regular bet.';
        }

        alert('Withdraw failed:\n\n' + userMessage);
        return;
      }

      console.log('[LpPositionCard] Withdraw response:', res.data);
      console.log('[LpPositionCard] Solana instruction:', res.data.solana_instruction);

      onWithdrawRequest({
        solanaInstruction: res.data.solana_instruction,
        withdrawAmount: res.data.withdrawAmount || res.data.amount,
        lpFeeBonus: res.data.lpFeeBonus || 0,
        totalWithdraw: res.data.totalWithdraw || res.data.amount,
        positionId: offer.userBetId || offer.id,
        offerId: offer.offer_id || null,
        match: match
      });
    } catch (err) {
      console.error('[LpPositionCard] Withdraw failed:', err);
      console.error('[LpPositionCard] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });

      const backendError = err.response?.data?.error || err.message;
      alert('Withdraw failed:\n\n' + backendError);
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
                    {isFutures ? '🏆' : offer.outcome === 'a' ? matchData.team_a_flag || '🏠' : offer.outcome === 'b' ? matchData.team_b_flag || '🏠' : '🤝'}
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

        {/* LP Result Indicator */}
        {(() => {
          console.log('[LpPositionCard] Rendering LP Result:', { isSettled, liquidityMatched, isLpWon, isLpLost, dbStatus });
          
          // CRITICAL: Check DB status FIRST - void/lost markets should show correctly
          if (dbStatus === 'void' || dbStatus === 'voided' || winningOutcome === 'void') {
            return (
              <div className="px-3 py-2 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">💸 Market Voided (LP Lost)</span>
                  <span className="text-white/40">Funds to DAO</span>
                </div>
              </div>
            );
          }
          
          if (dbStatus === 'lost') {
            return (
              <div className="px-3 py-2 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">💸 LP Position Lost</span>
                  <span className="text-white/40">Backed winner ✗</span>
                </div>
              </div>
            );
          }
          
          if (liquidityMatched === 0) {
            return (
              <div className="px-3 py-2 rounded-lg border bg-secondary/10 border-secondary/30 text-muted-foreground">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">ℹ️ Unmatched (No Action)</span>
                  <span className="text-white/40">No bets were matched</span>
                </div>
              </div>
            );
          }
          
          if (isSettled) {
            return (
              <div className={`px-3 py-2 rounded-lg border ${
              isLpWon ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-destructive/10 border-destructive/30 text-destructive'}`
              }>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold uppercase tracking-wider">
                    {isLpWon ? '🎉 LP Position Won' : '💸 LP Position Lost'}
                  </span>
                  <span className="text-white/40">
                    {isLpWon ? 'Backed loser ✓' : 'Backed winner ✗'}
                  </span>
                </div>
              </div>
            );
          }
          
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
            
            // Priority 0: VOIDED markets - block ALL withdrawals (matched AND unmatched)
            // When market is voided, ALL funds go to DAO - LPs cannot withdraw anything
            if (isVoided) {
              return (
                <div className="flex-1 flex items-center justify-between bg-destructive/15 border border-destructive/40 rounded-xl px-3 h-9">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-[11px] font-heading font-bold text-destructive uppercase tracking-wider">Market Voided</span>
                  </div>
                  <span className="font-heading font-black text-sm text-destructive/70">◎0.0000</span>
                </div>);

            }

            // Priority 0: Refunded/Withdrawn (unmatched positions) - CHECK THIS FIRST
            // Use aggregated userBetStatus to prevent old pending records from showing withdraw buttons
            if (liquidityMatched === 0 && (isRefunded || isWithdrawn || userBetStatus === 'refunded' || userBetStatus === 'withdrawn')) {
              return (
                <div className="flex-1 flex flex-col gap-1">
                  <Button
                    disabled
                    variant="outline"
                    className="w-full h-8 text-[10px] sm:text-xs border-white/10 text-white/40 bg-white/5 rounded-xl font-heading font-bold">
                    
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Withdrawn ◎{liquidityDeposited.toFixed(4)}
                  </Button>
                </div>);

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

            // Priority 2: LP LOST with matched liquidity - no funds to claim (includes voided markets)
            if ((isLpLost || isVoided) && liquidityMatched > 0) {
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

            // Priority 3: LP WON with matched liquidity - claim winnings (matched stake + fees)
            // Use aggregated userBetStatus to prevent already-claimed positions from showing claim buttons
            if (isLpWon && liquidityMatched > 0 && userBetStatus !== 'claimed' && !alreadyClaimed && onWithdrawRequest) {
              const claimAmount = liquidityMatched + liquidityMatched * 0.02; // stake + 2% fees
              return (
                <Button
                  onClick={handleWithdraw}
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs text-black rounded-xl font-heading font-bold"
                  style={{ background: 'linear-gradient(135deg, #14f195, #00ff87)' }}>
                  
                  <Trophy className="w-3 h-3 mr-1" />
                  Claim ◎{claimAmount.toFixed(4)}
                </Button>);

            }

            // Priority 4: Has unmatched liquidity - withdraw unmatched
            // For unmatched positions, allow withdrawal regardless of DB status (which may be 'pending' even after settlement)
            // Only block if already withdrawn/refunded in DB
            const canWithdrawUnmatched = (hasUnmatched || liquidityUnmatched > 0) && 
                                         userBetStatus !== 'refunded' && 
                                         userBetStatus !== 'withdrawn' &&
                                         onWithdrawRequest;
            if (canWithdrawUnmatched) {
              return (
                <Button
                  onClick={handleWithdraw}
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 rounded-xl font-heading font-bold bg-[#242424]">
                  
                  <Wallet className="w-3 h-3 mr-1" />
                  Withdraw ◎{liquidityUnmatched.toFixed(4)}
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
    </motion.div>);

}