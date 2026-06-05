import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock, Trophy } from 'lucide-react';
import { getTeamFlag } from '@/utils/flags';
import BetCountdown from '@/components/betting/BetCountdown';

export default function MatchLiquidityCard({ bet, match, isSelected, onClick }) {
  if (!bet || !match) return null;

  const oddsA = bet.odds_a || bet.oracle_odds_a || 2.0;
  const oddsB = bet.odds_b || bet.oracle_odds_b || 3.0;
  const oddsDraw = bet.odds_draw || bet.oracle_odds_draw || 3.2;

  const totalPool = bet.total_pool || 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden text-left"
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* Glow effect - color changes based on selection */}
      <div 
        className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl transition-opacity opacity-15`} 
        style={{ background: isSelected ? '#14f195' : '#a69cf2' }} 
      />
      
      {/* Content */}
      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Header - Match Info & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              {/* Match Badge */}
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                <div className="relative bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-1.5">
                  <Trophy className="w-4 h-4 text-primary" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-sm sm:text-base text-white truncate">
                    {match.team_a} vs {match.team_b}
                  </h3>
                </div>
                <p className="text-[9px] sm:text-[10px] text-white/50 truncate">
                  {match.group_stage || 'World Cup 2026'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1">
              <div className="flex items-center gap-1">
                <DollarSign className="w-2.5 h-2.5 text-emerald-400" />
                <span className="font-heading font-bold text-emerald-400 text-[10px]">{totalPool.toFixed(2)}</span>
              </div>
            </div>
            <BetCountdown openUntil={bet.open_until} label="Closes in" className="text-[8px]" />
          </div>
        </div>

        {/* Teams & Odds Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {/* Team A */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm rounded-xl p-2.5 border border-primary/20 text-center">
            <div className="text-2xl mb-1 filter drop-shadow-lg">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
            <p className="text-[8px] text-white/40 uppercase tracking-wider mb-1 truncate">{match.team_a}</p>
            <p className="font-heading font-bold text-primary text-xs sm:text-sm">{oddsA.toFixed(2)}x</p>
          </div>

          {/* Draw */}
          <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 backdrop-blur-sm rounded-xl p-2.5 border border-yellow-500/20 text-center">
            <div className="text-2xl mb-1">🤝</div>
            <p className="text-[8px] text-white/40 uppercase tracking-wider mb-1">Draw</p>
            <p className="font-heading font-bold text-yellow-400 text-xs sm:text-sm">{oddsDraw.toFixed(2)}x</p>
          </div>

          {/* Team B */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm rounded-xl p-2.5 border border-primary/20 text-center">
            <div className="text-2xl mb-1 filter drop-shadow-lg">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
            <p className="text-[8px] text-white/40 uppercase tracking-wider mb-1 truncate">{match.team_b}</p>
            <p className="font-heading font-bold text-primary text-xs sm:text-sm">{oddsB.toFixed(2)}x</p>
          </div>
        </div>

        {/* Action Button */}
        <div className={`pt-2 border-t border-white/10`}>
          <div className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
            isSelected 
              ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30' 
              : 'bg-white/5 border border-white/10 hover:bg-white/10'
          }`}>
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-white/50'}`} />
              <span className={`text-[10px] font-bold ${isSelected ? 'text-emerald-400' : 'text-white/60'}`}>
                {isSelected ? 'Provide Liquidity' : 'Add Liquidity'}
              </span>
            </div>
            {isSelected && <DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
          </div>
        </div>
      </div>
    </motion.button>
  );
}