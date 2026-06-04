import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, ArrowRight, DollarSign, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getTeamFlag } from '@/utils/flags';

export default function HottestBetCard({ match, bet, index }) {
  if (!match || !bet) return null;

  const topPoolOutcome = (() => {
    const pools = [
      { label: bet.outcome_a, pool: bet.pool_a || 0 },
      { label: bet.outcome_b, pool: bet.pool_b || 0 },
      { label: bet.outcome_draw || 'Draw', pool: bet.pool_draw || 0 },
    ];
    return pools.reduce((max, curr) => curr.pool > max.pool ? curr : max, pools[0]);
  })();

  const totalPool = bet.total_pool || 0;
  const totalBettors = bet.total_bettors || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="group relative overflow-hidden rounded-3xl border-2 border-border/50 bg-card hover:border-primary/40 transition-all duration-300"
      style={{
        background: 'linear-gradient(145deg, rgba(26,16,64,0.8) 0%, rgba(15,10,30,0.95) 100%)',
      }}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/15 blur-3xl rounded-full" />
      </div>

      {/* Hot badge */}
      <div className="absolute top-4 right-4 z-10">
        <div className="flex items-center gap-1.5 bg-destructive/20 backdrop-blur-sm border border-destructive/30 px-3 py-1.5 rounded-full">
          <Flame className="w-3.5 h-3.5 text-destructive" />
          <span className="text-[10px] font-black text-destructive uppercase tracking-wide">Hot</span>
        </div>
      </div>

      <Link to={`/bet/${bet.id}`} className="block p-6">
        {/* Match Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 bg-primary/10 backdrop-blur-sm border border-primary/20 px-3 py-1.5 rounded-full">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
                {bet.status === 'open' ? 'Live Betting' : 'Open'}
              </span>
            </div>
            {bet.odds_bookmaker && (
              <span className="text-[10px] text-muted-foreground font-medium">{bet.odds_bookmaker}</span>
            )}
          </div>

          {/* Teams */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <div className="text-5xl mb-2">{getTeamFlag(match.team_a)}</div>
              <p className="font-heading font-black text-lg leading-tight text-foreground">{match.team_a}</p>
            </div>
            
            <div className="flex flex-col items-center gap-1.5 px-3">
              <span className="font-heading font-black text-2xl text-primary">VS</span>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium bg-secondary/50 px-2 py-1 rounded-lg">
                <DollarSign className="w-2.5 h-2.5" />
                {(totalPool || 0).toFixed(2)} SOL
              </div>
            </div>

            <div className="flex-1 text-center">
              <div className="text-5xl mb-2">{getTeamFlag(match.team_b)}</div>
              <p className="font-heading font-black text-lg leading-tight text-foreground">{match.team_b}</p>
            </div>
          </div>
        </div>

        {/* Top Pool Outcome Highlight */}
        <div className="mb-5 bg-gradient-to-br from-primary/15 to-accent/10 backdrop-blur-sm border border-primary/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Most Backed Outcome</span>
            <Badge className="bg-primary/20 text-primary border border-primary/30 text-xs font-bold px-2.5 py-0.5">
              Top Pool
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading font-bold text-base text-foreground">{topPoolOutcome?.label}</p>
              <p className="text-[10px] text-muted-foreground">◎{topPoolOutcome?.pool?.toFixed(2) || '0'} in pool</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Pool Size</p>
              <p className="font-heading font-black text-xl text-primary">◎{totalPool.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-secondary/30 backdrop-blur-sm border border-border/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground font-medium uppercase">Total Pool</span>
            </div>
            <p className="font-heading font-black text-lg text-foreground">◎{totalPool.toFixed(2)}</p>
          </div>
          <div className="bg-secondary/30 backdrop-blur-sm border border-border/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground font-medium uppercase">Bettors</span>
            </div>
            <p className="font-heading font-black text-lg text-foreground">{totalBettors}</p>
          </div>
        </div>

        {/* CTA Button */}
        <div className="flex items-center justify-between pt-4 border-t border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-500">Open for Betting</span>
          </div>
          <div className="flex items-center gap-1.5 text-primary font-bold text-sm group-hover:translate-x-1 transition-transform">
            Place Bet <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}