import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Trophy, Droplets, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const statusStyles = {
  open: 'bg-accent/10 text-accent border border-accent/20',
  coming_soon: 'bg-secondary text-secondary-foreground',
  closed: 'bg-muted text-muted-foreground',
  settled: 'bg-muted text-muted-foreground'
};

const positionColors = {
  '1st': {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    hover: 'hover:border-yellow-500/50 hover:bg-yellow-500/20',
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  },
  '2nd': {
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    hover: 'hover:border-gray-500/50 hover:bg-gray-500/20',
    text: 'text-gray-400',
    badge: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  },
  '3rd': {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    hover: 'hover:border-orange-500/50 hover:bg-orange-500/20',
    text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  }
};

export default function FuturesCard({ market, index, onSelect }) {
  const totalPool = market.outcomes.reduce((sum, o) => sum + (o.pool || 0), 0);
  const totalLpOffers = market.outcomes.reduce((sum, o) => sum + (o.lp_offers || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <div className="group block">
        <div className="relative rounded-2xl p-4 transition-all duration-300 border border-primary/20 h-full bg-[#262322]">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground font-semibold truncate">
              {market.country}
            </span>
            <Badge className={`text-[9px] font-semibold uppercase tracking-wider flex-shrink-0 ${statusStyles[market.status] || statusStyles.open}`}>
              {market.status === 'open' && <span className="w-1 h-1 rounded-full bg-accent animate-pulse mr-1" />}
              {market.status.replace('_', ' ')}
            </Badge>
          </div>

          {/* Market Icon & Title */}
          <div className="flex items-center gap-3 mb-3">
            <div className="text-4xl">{market.icon || '🏆'}</div>
            <div className="flex-1">
              <h3 className="font-heading font-bold text-sm text-foreground truncate">{market.title}</h3>
              <p className="text-[10px] text-muted-foreground">{market.subtitle}</p>
            </div>
          </div>

          {/* Outcomes Grid - 1st, 2nd, 3rd (Clickable) */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {market.outcomes.slice(0, 3).map((outcome) => {
              const colors = positionColors[outcome.position] || positionColors['1st'];
              const hasLiquidity = (outcome.pool || 0) > 0 || (outcome.lp_offers || 0) > 0;
              
              return (
                <button
                  key={outcome.position}
                  onClick={() => onSelect && onSelect(market, outcome)}
                  className={`flex flex-col items-center justify-center rounded-xl px-2 py-2.5 border-2 transition-all ${colors.bg} ${colors.border} ${colors.hover} hover:scale-105 active:scale-95`}
                >
                  <div className={`flex items-center gap-1 mb-1 px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                    <Target className="w-2 h-2" />
                    <span className="text-[7px] font-black uppercase tracking-wider">{outcome.position}</span>
                  </div>
                  <p className={`font-heading font-black text-sm ${colors.text} mb-0.5`}>
                    {outcome.odds.toFixed(2)}x
                  </p>
                  {hasLiquidity ? (
                    <div className="flex items-center gap-0.5">
                      <Droplets className="w-2.5 h-2.5 text-accent" />
                      <p className="text-[9px] font-bold text-accent">
                        ◎{outcome.pool.toFixed(1)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[8px] text-muted-foreground">No LP</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pool Summary */}
          <div className="pt-2.5 border-t border-border/50">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
              <span>Total Pool</span>
              <span className="font-bold text-foreground">◎{totalPool.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Droplets className="w-2.5 h-2.5 text-accent" />
                LP Offers
              </span>
              <span className="font-bold text-accent">{totalLpOffers}</span>
            </div>
            <div className="flex items-center justify-end text-[10px] text-muted-foreground mt-2">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}