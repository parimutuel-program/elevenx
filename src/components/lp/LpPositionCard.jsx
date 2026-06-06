import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock, CheckCircle, ArrowRight, Percent, CheckCircle2, Wallet, Trophy, Calendar, AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import BetCountdown from '@/components/betting/BetCountdown';
import { base44 } from '@/api/base44Client';

export default function LpPositionCard({ position, match, walletAddress, onWithdrawRequest }) {
  // Support both BetOffer (offer) and UserBet (position) entities
  const offer = position;
  if (!offer) return null;
  
  // Detect if this is a futures LP position
  const isFutures = offer._isFutures || position._isFutures || false;
  
  // Get match from position data if not passed - ALWAYS use matchData, never match directly
  const matchData = match || position.match || { team_a: 'Team A', team_b: 'Team B', team_a_flag: '', team_b_flag: '', group_stage: '', match_end_time: null, winner: '' };
  
  // Determine if LP WON or LOST based on actual match result
  // LP wins when their backed outcome LOSES (parimutuel model)
  const getLpResult = () => {
    if (!matchData.winner || matchData.winner === '') return 'unsettled';
    
    // Map match winner to outcome
    const winningOutcome = matchData.winner === 'team_a' ? 'a' : matchData.winner === 'team_b' ? 'b' : 'draw';
    
    // LP backed this outcome
    const lpBackedOutcome = offer.outcome;
    
    // LP WINS when backed outcome LOSES (different from winning outcome)
    if (lpBackedOutcome !== winningOutcome) {
      return 'won';
    } else {
      return 'lost';
    }
  };
  
  const lpResult = getLpResult();
  const isLpWon = lpResult === 'won';
  const isLpLost = lpResult === 'lost';

  // Handle both BetOffer and UserBet structures - use amount as fallback for parimutuel LP
  const liquidityDeposited = offer.liquidity_deposited || offer.amount_offered || offer.amount || 0;
  const liquidityMatched = offer.liquidity_matched || offer.amount_matched || 0;
  const liquidityUnmatched = offer.liquidity_unmatched || offer.amount_unmatched || 0;
  
  const matchPct = liquidityDeposited > 0
    ? Math.round((liquidityMatched / liquidityDeposited) * 100)
    : 0;

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
    open: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30' },
    partially_matched: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    fully_matched: { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30' },
    withdrawn: { color: 'text-muted-foreground', bg: 'bg-secondary/20', border: 'border-secondary/30' },
    settled: { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30' },
  };

  const currentStatus = statusConfig[offer.status] || statusConfig.open;
  
  // Handle withdraw click - fetch match data and prepare withdraw instruction
  const handleWithdraw = async () => {
    if (!onWithdrawRequest) return;
    
    try {
      const isWon = offer.status === 'won' || offer.userBet?.status === 'won';
      const isSettled = offer.status === 'settled' || offer.userBet?.status === 'settled';
      const isLost = offer.status === 'lost';
      
      console.log('[LpPositionCard] Withdraw attempt:', {
        offer_id: offer.id,
        userBetId: offer.userBetId || offer.id,
        offer_status: offer.status,
        isWon,
        isSettled,
        isLost,
        hasUnmatched,
      });
      
      let res;
      if (isWon) {
        // LP won (backed the losing outcome) - withdraw winnings with fee bonus
        console.log('[LpPositionCard] Withdrawing winnings (LP won) for position:', offer.id);
        res = await base44.functions.invoke('withdrawLpWinnings', {
          userBetId: offer.userBetId || offer.id
        });
      } else if (isSettled && !isLost && hasUnmatched) {
        // Market settled, LP didn't lose (has unmatched funds) - withdraw unmatched
        console.log('[LpPositionCard] Withdrawing unmatched from settled market:', offer.id);
        res = await base44.functions.invoke('withdrawUnmatchedLiquidity', {
          userBetId: offer.userBetId || offer.id,
          walletAddress
        });
      } else if (isSettled && !isWon && !isLost) {
        // Market settled but status unclear - try withdrawLpWinnings
        console.log('[LpPositionCard] Trying withdrawLpWinnings for settled position:', offer.id);
        res = await base44.functions.invoke('withdrawLpWinnings', {
          userBetId: offer.userBetId || offer.id
        });
      } else {
        // Unmatched liquidity withdrawal (market still open or has unmatched funds)
        console.log('[LpPositionCard] Withdrawing unmatched liquidity for position:', offer.id);
        res = await base44.functions.invoke('withdrawUnmatchedLiquidity', {
          userBetId: offer.userBetId || offer.id,
          walletAddress
        });
      }
      
      // Handle HTTP errors (400, 404, 500, etc.)
      if (res.status !== 200 || res.data?.error) {
        const errorMsg = res.data?.error || res.statusText || 'Unknown error';
        console.error('[LpPositionCard] Withdraw failed:', {
          status: res.status,
          error: errorMsg,
          data: res.data,
        });
        
        let userMessage = errorMsg;
        if (errorMsg.includes('did not win') || errorMsg.includes('LP position did not win')) {
          userMessage = 'This LP position did not win. In parimutuel betting, LPs profit when bettors lose.\n\nYour backed outcome won, so the LP position lost value.';
        } else if (errorMsg.includes('Market has not been settled')) {
          userMessage = 'Market must be settled before claiming. Wait for admin to settle the market.';
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
        status: err.response?.status,
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
        background: isFutures 
          ? 'linear-gradient(180deg, #2d1f4e 0%, #1a0f2e 100%)' // Purple gradient for futures
          : 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)', // Dark blue for matches
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
      }}
    >
      {/* Glow effect */}
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10`} 
        style={{ background: isFutures ? '#fbbf24' : isFullyMatched ? '#14f195' : isPartiallyMatched ? '#fbbf24' : '#a69cf2' }} />

      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Header - Outcome & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              {/* LP Side Indicator - Flag or Trophy */}
              <div className="relative">
                <div className={`absolute inset-0 blur-md rounded-full ${isFutures ? 'bg-yellow-500/20' : 'bg-primary/20'}`} />
                <div className={`relative bg-gradient-to-br border rounded-lg p-1.5 ${
                  isFutures 
                    ? 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30' 
                    : 'from-primary/20 to-primary/10 border-primary/30'
                }`}>
                  <span className="text-xl filter drop-shadow-md">
                    {isFutures ? '🏆' : offer.outcome === 'a' ? (matchData.team_a_flag || '🏠') : offer.outcome === 'b' ? (matchData.team_b_flag || '🏠') : '🤝'}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-sm sm:text-base text-white truncate">
                    {getOutcomeLabel()}
                  </h3>
                  {isFutures ? (
                    <span className={`text-[9px] font-bold ${isFutures ? 'text-yellow-400' : 'text-primary/80'}`}>
                      {offer.outcome_label}
                    </span>
                  ) : (
                    <span className="text-[9px] text-primary/80 font-bold">
                      {offer.outcome === 'a' ? matchData.team_a : offer.outcome === 'b' ? matchData.team_b : 'Draw'}
                    </span>
                  )}
                </div>
                <p className="text-[9px] sm:text-[10px] text-white/50 truncate">
                  {isFutures ? 'Tournament Market' : (matchData.group_stage || 'World Cup 2026')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              {/* Type Badge - FUTURES vs MATCH */}
              <div className={`${
                isFutures 
                  ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border-yellow-500/40 text-yellow-400' 
                  : 'bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30 text-primary'
              } border backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1`}>
                {isFutures ? (
                  <>
                    <Trophy className="w-2.5 h-2.5" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Futures</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-2.5 h-2.5" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">Match</span>
                  </>
                )}
              </div>
              <Badge className={`${currentStatus.bg} ${currentStatus.border} ${currentStatus.color} text-[9px] sm:text-[10px] font-bold border`}>
                {offer.status.replace('_', ' ')}
              </Badge>
            </div>
            {!isFutures && matchData.match_end_time && (
              <BetCountdown openUntil={matchData.match_end_time} label="Betting closes" className="text-[8px]" />
            )}
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
                'bg-gradient-to-r from-primary/50 to-primary'
              }`}
              style={{ width: `${matchPct}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-white/10">
          {(() => {
            const isClaimed = offer.status === 'claimed' || offer.userBet?.status === 'claimed';
            const isSettled = offer.status === 'settled' || offer.userBet?.status === 'settled';
            
            if (isClaimed) {
              return (
                <Button
                  disabled
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-accent/20 text-accent/50 bg-accent/5 rounded-xl font-heading font-bold"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Claimed
                </Button>
              );
            }
            
            // LP LOST = backed the winning outcome (had to pay winners, nothing left)
            // Show "No Funds" - no claim button
            if (isLpLost || (isSettled && !isLpWon && !hasUnmatched)) {
              return (
                <Button
                  disabled
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-destructive/20 text-destructive/50 bg-destructive/5 rounded-xl font-heading font-bold"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  No Funds
                </Button>
              );
            }
            
            // Show "Fully Matched" when position is open/active but no unmatched liquidity
            if (!hasUnmatched && !isSettled && !isLpWon && !isLpLost && (offer.status === 'open' || offer.status === 'partially_matched' || offer.status === 'fully_matched')) {
              return (
                <Button
                  disabled
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-border/30 text-muted-foreground bg-secondary/10 rounded-xl font-heading font-bold"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Fully Matched
                </Button>
              );
            }
            
            // Show "Market Closed" when market is closed but not yet settled
            if (offer.status === 'closed' || (!isSettled && !hasUnmatched && offer.status !== 'open')) {
              return (
                <Button
                  disabled
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-border/30 text-muted-foreground bg-secondary/10 rounded-xl font-heading font-bold"
                >
                  <Clock className="w-3 h-3 mr-1" />
                  Market Closed
                </Button>
              );
            }
            
            // Only show "Claim Winnings" if LP actually WON (backed the losing outcome)
            if (isLpWon && onWithdrawRequest) {
              return (
                <Button
                  onClick={handleWithdraw}
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs text-black rounded-xl font-heading font-bold"
                  style={{ background: 'linear-gradient(135deg, #14f195, #00ff87)' }}
                >
                  <Trophy className="w-3 h-3 mr-1" />
                  Claim Winnings
                </Button>
              );
            }
            
            // Show withdraw unmatched for open markets with unmatched liquidity
            if (hasUnmatched && onWithdrawRequest) {
              return (
                <Button
                  onClick={handleWithdraw}
                  className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 rounded-xl font-heading font-bold"
                >
                  <Wallet className="w-3 h-3 mr-1" />
                  Withdraw ◎{liquidityUnmatched.toFixed(4)}
                </Button>
              );
            }
            
            return (
              <Button
                disabled
                variant="outline"
                className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-accent/30 text-accent bg-accent/10 rounded-xl font-heading font-bold"
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Fully Locked
              </Button>
            );
          })()}
          
          <Link to={`/match/${offer.match_id}`} className="flex-1">
            <Button
              variant="outline"
              className="w-full h-8 sm:h-9 text-[10px] sm:text-xs border-border/50 text-white/70 hover:text-white hover:bg-white/5 rounded-xl font-heading font-bold"
            >
              View Market
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}