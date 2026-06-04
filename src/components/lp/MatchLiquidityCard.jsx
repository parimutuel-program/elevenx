import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Info } from 'lucide-react';
import { getTeamFlag } from '@/utils/flags';

export default function MatchLiquidityCard({ bet, match, isSelected, onClick }) {
  if (!bet || !match) return null;

  const oddsA = bet.odds_a || bet.oracle_odds_a || 2.0;
  const oddsB = bet.odds_b || bet.oracle_odds_b || 3.0;
  const oddsDraw = bet.odds_draw || bet.oracle_odds_draw || 3.2;

  const totalPool = bet.total_pool || 0;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`p-4 rounded-xl border text-left transition-all h-full flex flex-col ${
        isSelected
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
          : 'border-border/50 bg-secondary/30 hover:border-primary/30'
      }`}
    >
      {/* Header - Teams with flags */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 text-center">
          <div className="text-2xl mb-0.5">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
          <p className="font-heading font-bold text-[10px] leading-tight truncate">{match.team_a}</p>
        </div>
        
        <div className="flex flex-col items-center px-2">
          <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full mb-1">VS</span>
          <div className="flex items-center gap-1 text-[8px] text-muted-foreground">
            <DollarSign className="w-2 h-2" />
            {totalPool.toFixed(1)}
          </div>
        </div>

        <div className="flex-1 text-center">
          <div className="text-2xl mb-0.5">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
          <p className="font-heading font-bold text-[10px] leading-tight truncate">{match.team_b}</p>
        </div>
      </div>

      {/* Odds grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-1.5 text-center">
          <p className="text-[8px] text-muted-foreground truncate">{match.team_a}</p>
          <p className="font-bold text-primary text-xs">{oddsA.toFixed(2)}x</p>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-1.5 text-center">
          <p className="text-[8px] text-muted-foreground">Draw</p>
          <p className="font-bold text-yellow-400 text-xs">{oddsDraw.toFixed(2)}x</p>
        </div>
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-1.5 text-center">
          <p className="text-[8px] text-muted-foreground truncate">{match.team_b}</p>
          <p className="font-bold text-accent text-xs">{oddsB.toFixed(2)}x</p>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <span className="text-[9px] text-muted-foreground">{match.group_stage || 'World Cup'}</span>
        <div className="flex items-center gap-1 text-[9px] text-primary font-bold">
          Select <Info className="w-2.5 h-2.5" />
        </div>
      </div>
    </motion.button>
  );
}