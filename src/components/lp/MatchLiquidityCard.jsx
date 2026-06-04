import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
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
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative rounded-3xl h-full overflow-hidden text-left"
      style={{
        background: isSelected 
          ? 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)'
          : 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        boxShadow: isSelected
          ? '0 8px 32px rgba(33,196,93,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
          : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        border: isSelected ? '1px solid rgba(33,196,93,0.3)' : '1px solid rgba(255,255,255,0.08)'
      }}
    >
      {/* Subtle glow effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl transition-opacity ${
        isSelected ? 'opacity-20' : 'opacity-5'
      }`} style={{ background: '#21c45d' }} />
      
      {/* Content */}
      <div className="relative p-5 h-full flex flex-col">
        {/* Header - Teams */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 text-center">
            <div className="text-3xl mb-1 filter drop-shadow-lg">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
            <p className="font-heading font-bold text-[11px] text-white/90 truncate">{match.team_a}</p>
          </div>
          
          <div className="flex flex-col items-center px-3">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-[9px] font-bold px-3 py-1 rounded-full mb-2 shadow-lg shadow-emerald-500/25">
              VS
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 backdrop-blur-sm px-2.5 py-1.5 rounded-xl border border-white/10">
              <DollarSign className="w-3 h-3 text-emerald-400" />
              <span className="font-heading font-bold text-white text-xs">{totalPool.toFixed(1)}</span>
            </div>
          </div>

          <div className="flex-1 text-center">
            <div className="text-3xl mb-1 filter drop-shadow-lg">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
            <p className="font-heading font-bold text-[11px] text-white/90 truncate">{match.team_b}</p>
          </div>
        </div>

        {/* Odds Grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl p-3 border border-white/10 text-center">
            <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold mb-1.5 truncate">{match.team_a}</p>
            <p className="font-heading font-bold text-emerald-400 text-sm">{oddsA.toFixed(2)}x</p>
          </div>
          <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl p-3 border border-white/10 text-center">
            <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold mb-1.5">Draw</p>
            <p className="font-heading font-bold text-yellow-400 text-sm">{oddsDraw.toFixed(2)}x</p>
          </div>
          <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl p-3 border border-white/10 text-center">
            <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold mb-1.5 truncate">{match.team_b}</p>
            <p className="font-heading font-bold text-emerald-400 text-sm">{oddsB.toFixed(2)}x</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto space-y-2 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">{match.group_stage || 'World Cup'}</span>
            <BetCountdown openUntil={bet.open_until} label="Betting closes" />
          </div>
          <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl transition-all ${
            isSelected ? 'bg-emerald-500/20' : 'bg-white/5'
          }`}>
            <span className={`text-[10px] font-bold ${isSelected ? 'text-emerald-400' : 'text-white/50'}`}>
              {isSelected ? 'Selected' : 'Select'}
            </span>
            <TrendingUp className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-white/50'}`} />
          </div>
        </div>
      </div>
    </motion.button>
  );
}