import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock, CheckCircle, ArrowRight, Percent, CheckCircle2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import BetCountdown from '@/components/betting/BetCountdown';
import { base44 } from '@/api/base44Client';

export default function LpPositionCard({ position, match, walletAddress, onWithdrawRequest }) {
  // Support both BetOffer (offer) and UserBet (position) entities
  const offer = position;
  if (!offer) return null;
  
  // Get match from position data if not passed - ALWAYS use matchData, never match directly
  const matchData = match || position.match || { team_a: 'Team A', team_b: 'Team B', team_a_flag: '', team_b_flag: '', group_stage: '', match_end_time: null };

  // Handle UserBet entity structure (liquidity_deposited, liquidity_matched, liquidity_unmatched)
  const liquidityDeposited = offer.liquidity_deposited || offer.amount_offered || 0;
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
      // Fetch match data if not provided
      let matchData = match;
      if (!matchData && offer.match_id) {
        const matches = await base44.entities.Match.list();
        matchData = matches.find(m => m.id === offer.match_id);
      }
      
      // Call backend to prepare withdraw instruction
      const res = await base44.functions.invoke('withdrawLiquidity', {
        walletAddress,
        userBetId: offer.id,
        offer_id: offer.offer_id
      });
      
      if (res.data.error) {
        console.error('[LpPositionCard] Withdraw error:', res.data.error);
        return;
      }
      
      // Pass withdraw data to parent
      onWithdrawRequest({
        solanaInstruction: res.data.solana_instruction,
        withdrawAmount: res.data.amount,
        positionId: offer.id,
        offerId: offer.offer_id,
        match: matchData
      });
    } catch (err) {
      console.error('[LpPositionCard] Withdraw failed:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden border border-white/10"
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
      }}
    >
      {/* Glow effect */}
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10`} 
        style={{ background: isFullyMatched ? '#14f195' : isPartiallyMatched ? '#fbbf24' : '#a69cf2' }} />

      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Header - Outcome & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              {/* LP Side Indicator - Flag */}
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                <div className="relative bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-1.5">
                  <span className="text-xl filter drop-shadow-md">
                    {offer.outcome === 'a' ? (matchData.team_a_flag || '🏠') : offer.outcome === 'b' ? (matchData.team_b_flag || '🏠') : '🤝'}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-sm sm:text-base text-white truncate">
                    {getOutcomeLabel()}
                  </h3>
                  <span className="text-[9px] text-primary/80 font-bold">
                    {offer.outcome === 'a' ? matchData.team_a : offer.outcome === 'b' ? matchData.team_b : 'Draw'}
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-white/50 truncate">
                  {matchData.group_stage || 'World Cup 2026'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={`${currentStatus.bg} ${currentStatus.border} ${currentStatus.color} text-[9px] sm:text-[10px] font-bold border`}>
              {offer.status.replace('_', ' ')}
            </Badge>
            <BetCountdown openUntil={matchData.match_end_time} label="Betting closes" className="text-[8px]" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/10">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Deposited</span>
            </div>
            <p className="font-heading font-bold text-white text-xs sm:text-sm">
              ◎{liquidityDeposited.toFixed(4)}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/10">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle className="w-2.5 h-2.5 text-accent" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Matched</span>
            </div>
            <p className="font-heading font-bold text-accent text-xs sm:text-sm">
              ◎{liquidityMatched.toFixed(4)}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/10">
            <div className="flex items-center gap-1 mb-1">
              <Wallet className="w-2.5 h-2.5 text-yellow-400" />
              <span className="text-[8px] sm:text-[9px] text-white/40 uppercase tracking-wider">Available</span>
            </div>
            <p className="font-heading font-bold text-yellow-400 text-xs sm:text-sm">
              ◎{liquidityUnmatched.toFixed(4)}
            </p>
          </div>
        </div>

        {/* Earnings & Progress */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Percent className="w-3 h-3 text-primary" />
              <span className="text-[9px] sm:text-[10px] text-white/50">Fees Earned</span>
            </div>
            <p className="font-heading font-bold text-primary text-xs sm:text-sm">
              ◎{potentialEarnings.toFixed(4)}
            </p>
          </div>

          <div>
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
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-white/10">
          {hasUnmatched && onWithdrawRequest ? (
            <Button
              onClick={handleWithdraw}
              variant="outline"
              className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 rounded-xl font-heading font-bold"
            >
              <Wallet className="w-3 h-3 mr-1" />
              Withdraw ◎{liquidityUnmatched.toFixed(4)}
            </Button>
          ) : (
            <Button
              disabled
              variant="outline"
              className="flex-1 h-8 sm:h-9 text-[10px] sm:text-xs border-accent/30 text-accent bg-accent/10 rounded-xl font-heading font-bold"
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Fully Locked
            </Button>
          )}
          
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