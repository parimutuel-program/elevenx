import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Lock, Flame, Zap, Droplets, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function GroupCountryCard({ market, onSelect }) {
  const outcomes = market.outcomes || [];
  const firstPlace = outcomes.find(o => o.position === '1st');
  const secondPlace = outcomes.find(o => o.position === '2nd');
  const thirdPlace = outcomes.find(o => o.position === '3rd');

  const totalPool = outcomes.reduce((sum, o) => sum + (o.pool || 0), 0);
  const totalLpOffers = outcomes.reduce((sum, o) => sum + (o.lp_offers || 0), 0);

  const isOpen = market.status === 'open';
  const hasLiquidity = totalLpOffers > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.03, y: -4 }}
      transition={{ duration: 0.2 }}
      className={`relative rounded-3xl overflow-hidden transition-all duration-300 ${
        isOpen 
          ? 'cursor-pointer shadow-lg hover:shadow-2xl' 
          : 'opacity-60'
      }`}
      style={{
        background: isOpen 
          ? 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)'
          : 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
        boxShadow: isOpen && hasLiquidity
          ? '0 8px 32px rgba(33,196,93,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
          : '0 8px 32px rgba(0,0,0,0.4)'
      }}
    >
      {/* Glow effect for open markets */}
      {isOpen && (
        <>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#21c45d' }} />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full blur-3xl opacity-15" style={{ background: '#a69cf2' }} />
        </>
      )}

      {/* Content */}
      <div className="relative p-5">
        {/* Country Header with Flag */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className={`absolute inset-0 rounded-full blur-xl transition-all ${
              isOpen ? 'bg-emerald-500/30 opacity-100' : 'bg-gray-500/20 opacity-50'
            }`} />
            <div className={`relative w-16 h-16 rounded-full border-2 flex items-center justify-center text-4xl shadow-2xl ${
              isOpen 
                ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border-emerald-500/40' 
                : 'bg-gradient-to-br from-gray-500/20 to-gray-600/20 border-gray-500/30 grayscale'
            }`}>
              <span className="filter drop-shadow-lg">{market.country_flag || '🏳️'}</span>
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className={`font-heading font-black text-lg truncate ${
              isOpen ? 'text-white' : 'text-white/40'
            }`}>
              {market.country}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {isOpen ? (
                <Badge className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                  LIVE BETTING
                </Badge>
              ) : (
                <Badge className="text-[8px] bg-gray-500/20 text-gray-400 border border-gray-500/30">
                  <Lock className="w-2 h-2 mr-1" />
                  SOON
                </Badge>
              )}
              {hasLiquidity && isOpen && (
                <Badge className="text-[8px] bg-primary/20 text-primary border border-primary/30 font-bold">
                  <Droplets className="w-2 h-2 mr-1" />
                  {totalLpOffers} LPs
                </Badge>
              )}
            </div>
          </div>

          {/* Hot Badge for high pools */}
          {totalPool > 50 && isOpen && (
            <div className="absolute top-0 right-0">
              <div className="flex items-center gap-1 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 px-2 py-1 rounded-full">
                <Flame className="w-3 h-3 text-orange-400" />
                <span className="text-[8px] font-bold text-orange-400">HOT</span>
              </div>
            </div>
          )}
        </div>

        {/* Betting Outcomes - Medal Positions */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {/* 1st Place - Gold */}
          <button
            onClick={() => isOpen && firstPlace && onSelect(market, firstPlace)}
            disabled={!isOpen || !firstPlace}
            className={`relative overflow-hidden rounded-2xl p-3 border-2 transition-all duration-300 group ${
              isOpen && firstPlace
                ? 'border-yellow-500/50 bg-gradient-to-br from-yellow-500/15 via-yellow-500/5 to-transparent hover:border-yellow-400 hover:from-yellow-500/25 hover:to-yellow-400/10 cursor-pointer'
                : 'border-border/20 bg-secondary/10 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-30 transition-opacity" style={{ background: '#eab308' }} />
            <div className="relative text-center">
              <div className="text-lg mb-0.5">🥇</div>
              <div className="text-[8px] font-bold text-yellow-400/80 uppercase tracking-wider mb-1">WIN</div>
              <div className="font-heading font-black text-lg text-yellow-400 drop-shadow-lg">
                {firstPlace?.odds ? `${firstPlace.odds.toFixed(2)}x` : '--'}
              </div>
              {firstPlace?.pool > 0 && (
                <div className="text-[7px] text-yellow-400/60 mt-0.5">
                  ◎{(firstPlace.pool / 1000).toFixed(1)}K
                </div>
              )}
            </div>
          </button>

          {/* 2nd Place - Silver */}
          <button
            onClick={() => isOpen && secondPlace && onSelect(market, secondPlace)}
            disabled={!isOpen || !secondPlace}
            className={`relative overflow-hidden rounded-2xl p-3 border-2 transition-all duration-300 group ${
              isOpen && secondPlace
                ? 'border-slate-400/50 bg-gradient-to-br from-slate-400/15 via-slate-400/5 to-transparent hover:border-slate-300 hover:from-slate-400/25 hover:to-slate-300/10 cursor-pointer'
                : 'border-border/20 bg-secondary/10 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-30 transition-opacity" style={{ background: '#94a3b8' }} />
            <div className="relative text-center">
              <div className="text-lg mb-0.5">🥈</div>
              <div className="text-[8px] font-bold text-slate-400/80 uppercase tracking-wider mb-1">PLACE</div>
              <div className="font-heading font-black text-lg text-slate-300 drop-shadow-lg">
                {secondPlace?.odds ? `${secondPlace.odds.toFixed(2)}x` : '--'}
              </div>
              {secondPlace?.pool > 0 && (
                <div className="text-[7px] text-slate-400/60 mt-0.5">
                  ◎{(secondPlace.pool / 1000).toFixed(1)}K
                </div>
              )}
            </div>
          </button>

          {/* 3rd Place - Bronze */}
          <button
            onClick={() => isOpen && thirdPlace && onSelect(market, thirdPlace)}
            disabled={!isOpen || !thirdPlace}
            className={`relative overflow-hidden rounded-2xl p-3 border-2 transition-all duration-300 group ${
              isOpen && thirdPlace
                ? 'border-amber-600/50 bg-gradient-to-br from-amber-600/15 via-amber-600/5 to-transparent hover:border-amber-500 hover:from-amber-600/25 hover:to-amber-500/10 cursor-pointer'
                : 'border-border/20 bg-secondary/10 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-30 transition-opacity" style={{ background: '#d97706' }} />
            <div className="relative text-center">
              <div className="text-lg mb-0.5">🥉</div>
              <div className="text-[8px] font-bold text-amber-500/80 uppercase tracking-wider mb-1">SHOW</div>
              <div className="font-heading font-black text-lg text-amber-500 drop-shadow-lg">
                {thirdPlace?.odds ? `${thirdPlace.odds.toFixed(2)}x` : '--'}
              </div>
              {thirdPlace?.pool > 0 && (
                <div className="text-[7px] text-amber-500/60 mt-0.5">
                  ◎{(thirdPlace.pool / 1000).toFixed(1)}K
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Pool Stats Bar */}
        <div className={`rounded-xl p-3 border transition-all ${
          hasLiquidity && isOpen
            ? 'bg-gradient-to-r from-emerald-500/10 via-primary/10 to-emerald-500/10 border-emerald-500/30'
            : 'bg-secondary/10 border-border/20'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                hasLiquidity && isOpen ? 'bg-emerald-500/20' : 'bg-secondary/50'
              }`}>
                <Droplets className={`w-4 h-4 ${
                  hasLiquidity && isOpen ? 'text-emerald-400' : 'text-muted-foreground'
                }`} />
              </div>
              <div>
                <p className="text-[8px] text-muted-foreground uppercase tracking-wider font-bold">Total Pool</p>
                <p className={`font-heading font-black text-lg ${
                  hasLiquidity && isOpen ? 'text-emerald-400' : 'text-muted-foreground'
                }`}>
                  ◎{(totalPool / 1000).toFixed(2)}K
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider font-bold">LP Offers</p>
              <p className={`font-heading font-bold text-lg flex items-center gap-1 ${
                hasLiquidity && isOpen ? 'text-primary' : 'text-muted-foreground'
              }`}>
                <Crown className="w-3.5 h-3.5" />
                {totalLpOffers}
              </p>
            </div>
          </div>

          {/* Pool Progress Bar */}
          {hasLiquidity && isOpen && (
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 via-primary to-emerald-400 rounded-full transition-all shadow-lg shadow-emerald-500/30"
                style={{ width: `${Math.min(100, (totalPool / 100) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* FOMO Banner for high activity */}
        {totalPool > 100 && isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 bg-gradient-to-r from-orange-500/10 via-red-500/10 to-orange-500/10 border border-orange-500/30 rounded-xl p-2.5"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <p className="text-[9px] font-bold text-orange-400">
                🔥 {Math.floor(totalPool / 10)} bets placed in last hour
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}