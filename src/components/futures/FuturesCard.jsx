import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Trophy, Droplets, Clock, Loader } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import BetCountdown from '@/components/betting/BetCountdown';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

const statusStyles = {
  open: 'bg-accent/10 text-accent border border-accent/20',
  coming_soon: 'bg-secondary text-secondary-foreground',
  closed: 'bg-muted text-muted-foreground',
  settled: 'bg-muted text-muted-foreground'
};

const positionColors = {
  '1st': {
    bg: 'bg-yellow-500/5',
    border: 'border-yellow-500/20',
    hover: 'hover:border-yellow-500/40 hover:bg-yellow-500/10',
    text: 'text-yellow-500',
    accent: 'text-yellow-600'
  },
  '2nd': {
    bg: 'bg-slate-500/5',
    border: 'border-slate-500/20',
    hover: 'hover:border-slate-500/40 hover:bg-slate-500/10',
    text: 'text-slate-400',
    accent: 'text-slate-500'
  },
  '3rd': {
    bg: 'bg-orange-500/5',
    border: 'border-orange-500/20',
    hover: 'hover:border-orange-500/40 hover:bg-orange-500/10',
    text: 'text-orange-500',
    accent: 'text-orange-600'
  }
};

export default function FuturesCard({ market, index, onSelect }) {
  const [onChainLiquidity, setOnChainLiquidity] = useState(null);
  const [isLoadingLiquidity, setIsLoadingLiquidity] = useState(false);

  // Fetch real on-chain liquidity for each outcome
  useEffect(() => {
    const fetchLiquidity = async () => {
      if (!market?.id || market.status !== 'open') return;
      setIsLoadingLiquidity(true);
      try {
        const res = await base44.functions.invoke('getFuturesLiquidity', {
          market_id: market.id
        });
        if (res.data?.success && res.data?.outcomes) {
          setOnChainLiquidity(res.data.outcomes);
        }
      } catch (err) {
        console.error('[FuturesCard] Failed to fetch liquidity:', err);
      } finally {
        setIsLoadingLiquidity(false);
      }
    };
    fetchLiquidity();
  }, [market?.id, market.status]);

  const totalPool = market.outcomes.reduce((sum, o) => sum + (o.pool || 0), 0);
  const totalLpOffers = market.outcomes.reduce((sum, o) => sum + (o.lp_offers || 0), 0);
  
  // Show 0% when no bets placed - bar only fills when actual betting happens
  const filledPercentage = totalPool > 0 ? Math.min(100, Math.round(totalPool * 5)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}>
      
      <div className="group block">
        <div className="relative rounded-2xl p-4 transition-all duration-300 border border-primary/20 h-full bg-[#1c1c1c]">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground font-semibold truncate">
              {market.country}
            </span>
            <div className="flex items-center gap-2">
              {market.status === 'open' ? (
                market.open_until ? <BetCountdown openUntil={market.open_until} label="" className="text-[8px]" /> : null
              ) : market.status === 'settled' ? (
                <span className="text-[9px] font-bold text-muted-foreground bg-muted/50 border border-border px-2 py-0.5 rounded-full">✅ Settled</span>
              ) : (
                <span className="text-[9px] font-bold text-yellow-400 bg-yellow-500/20 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                  📅 Opens Jun 11
                </span>
              )}
            </div>
          </div>

          {/* Market Icon & Title */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 flex items-center justify-center text-3xl">
              {market.country_flag || '🏳️'}
            </div>
            <div className="flex-1">
              <h3 className="font-heading font-bold text-sm text-foreground truncate">{market.title}</h3>
              <p className="text-[10px] text-muted-foreground">{market.subtitle}</p>
            </div>
          </div>

          {/* Outcomes Grid - 1st, 2nd, 3rd (Clickable) */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {market.outcomes.slice(0, 3).map((outcome, idx) => {
              const colors = positionColors[outcome.position] || positionColors['1st'];
              
              // Use REAL on-chain max stake if available
              const onChainData = onChainLiquidity?.[idx];
              const maxStake = onChainData?.maxStake || (outcome.pool || 0);
              const hasLiquidity = maxStake > 0.001;

              return (
                <button
                  key={outcome.position}
                  onClick={() => onSelect && onSelect(market, outcome)}
                  className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 border transition-all ${colors.bg} ${colors.border} ${colors.hover} hover:scale-[1.02] active:scale-[0.98]`}>
                  
                  <span className={`text-[9px] font-bold uppercase tracking-wide mb-0.5 ${colors.text}`}>
                    {outcome.position}
                  </span>
                  <p className={`text-[10px] font-bold ${colors.text} mb-0.5 truncate w-full text-center`}>
                    {outcome.flag || '🏳️'} {outcome.label}
                  </p>
                  <p className={`font-heading font-bold text-xs ${colors.text}`}>
                    {outcome.odds.toFixed(2)}x
                  </p>
                  {isLoadingLiquidity ? (
                    <div className="flex items-center gap-1 w-full mt-1">
                      <Loader className={`w-2 h-2 ${colors.text} animate-spin`} />
                      <p className={`text-[8px] font-semibold ${colors.text}`}>Loading...</p>
                    </div>
                  ) : hasLiquidity ? (
                    <div className="flex items-center gap-1 w-full mt-1">
                      <div className="flex items-center gap-0.5 flex-1">
                        <Droplets className={`w-2 h-2 ${colors.accent}`} />
                        <p className={`text-[8px] font-semibold ${colors.accent}`}>
                          ◎{maxStake.toFixed(2)}
                        </p>
                      </div>
                      <span className={`text-[7px] font-bold ${colors.text} px-1 py-0.5 rounded bg-${colors.text.split('-')[1]}-500/10`}>
                        Max ◎{maxStake.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[7px] text-muted-foreground">No LP</p>
                  )}
                </button>);

            })}
          </div>

          {/* Pool Summary */}
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2.5">
              <span>Total Pool</span>
              <span className="font-bold text-foreground">◎{totalPool.toFixed(1)}</span>
            </div>
            
            {/* Hype Bar */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between text-[9px] mb-1">
                <span className="text-accent font-bold uppercase tracking-wider">Liquidity Active</span>
                <span className="text-muted-foreground">{totalPool > 0 ? `${filledPercentage}% matched` : 'Awaiting bets'}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden border border-border/50">
                <div 
                  className="h-full bg-gradient-to-r from-accent/60 to-accent rounded-full transition-all duration-500"
                  style={{ width: `${filledPercentage}%` }}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-accent/10 px-2 py-1 rounded-lg border border-accent/20">
                  <Droplets className="w-3 h-3 text-accent" />
                  <span className="text-[10px] font-bold text-accent uppercase tracking-wide">LP Offers</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Total:</span>
                <span className="font-heading font-bold text-lg text-accent">{totalLpOffers}</span>
              </div>
            </div>
            <div className="flex items-center justify-end text-[10px] text-muted-foreground mt-2.5">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>);

}