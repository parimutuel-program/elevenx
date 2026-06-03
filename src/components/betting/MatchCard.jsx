import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { getTeamFlag } from '@/utils/flags';

const statusStyles = {
  upcoming: 'bg-secondary text-secondary-foreground',
  live: 'bg-destructive/20 text-destructive border border-destructive/30',
  finished: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

export default function MatchCard({ match, bet, index = 0 }) {
  const matchTime = match.match_time ? new Date(match.match_time) : null;

  const lpA = bet?.lp_amount_a || 0;
  const lpB = bet?.lp_amount_b || 0;
  const lpDraw = bet?.lp_amount_draw || 0;
  const totalLP = lpA + lpB + lpDraw;
  
  const oracleOddsA = (bet?.oracle_odds_a || 200) / 100;
  const oracleOddsB = (bet?.oracle_odds_b || 300) / 100;
  const oracleOddsDraw = (bet?.oracle_odds_draw || 320) / 100;
  
  const oddsA = (lpA > 0 && (lpB + lpDraw) > 0) ? (lpB + lpDraw) / lpA : oracleOddsA;
  const oddsB = (lpB > 0 && (lpA + lpDraw) > 0) ? (lpA + lpDraw) / lpB : oracleOddsB;
  const oddsDraw = (lpDraw > 0 && (lpA + lpB) > 0) ? (lpA + lpB) / lpDraw : oracleOddsDraw;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link to={`/match/${match.id}`} className="group block">
        <div className="relative bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-all duration-300 hover:shadow-[0_0_30px_-10px_hsl(45,100%,51%,0.15)]">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-muted-foreground font-semibold">
              {match.group_stage || 'World Cup 2026'}
            </span>
            <Badge className={`text-[9px] font-semibold uppercase tracking-wider ${statusStyles[match.status] || statusStyles.upcoming}`}>
              {match.status === 'live' && <span className="w-1 h-1 rounded-full bg-destructive animate-pulse mr-1" />}
              {match.status}
            </Badge>
          </div>

          {/* Match Matchup */}
          <div className="flex items-center justify-between gap-2 mb-3">
            {/* Team A */}
            <div className="flex-1 text-center">
              <div className="text-2xl mb-1">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
              <p className="text-[10px] text-foreground truncate font-medium">{match.team_a}</p>
            </div>

            {/* Score/VS */}
            <div className="flex flex-col items-center gap-1 px-2">
              {match.status === 'finished' || match.status === 'live' ? (
                <div className="flex items-center gap-1.5 text-sm font-bold">
                  <span>{match.score_a ?? 0}</span>
                  <span className="text-muted-foreground text-xs">-</span>
                  <span>{match.score_b ?? 0}</span>
                </div>
              ) : (
                <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">VS</span>
              )}
              {matchTime && (
                <span className="text-[8px] text-muted-foreground whitespace-nowrap">
                  {format(matchTime, 'MMM d')}
                </span>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <div className="text-2xl mb-1">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
              <p className="text-[10px] text-foreground truncate font-medium">{match.team_b}</p>
            </div>
          </div>

          {/* Odds/Pool */}
          {bet ? (
            <div className="pt-2 border-t border-border/50">
              <div className={`grid gap-1.5 mb-2 ${oracleOddsDraw ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className={`rounded px-1.5 py-1 text-center text-[9px] border ${lpA > 0 ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-muted-foreground truncate">{match.team_a}</p>
                  <p className="font-bold text-primary">{oddsA.toFixed(2)}x</p>
                </div>
                {oracleOddsDraw && (
                  <div className={`rounded px-1.5 py-1 text-center text-[9px] border ${lpDraw > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
                    <p className="text-muted-foreground">Draw</p>
                    <p className="font-bold text-yellow-400">{oddsDraw.toFixed(2)}x</p>
                  </div>
                )}
                <div className={`rounded px-1.5 py-1 text-center text-[9px] border ${lpB > 0 ? 'bg-accent/10 border-accent/20' : 'bg-accent/5 border-accent/10'}`}>
                  <p className="text-muted-foreground truncate">{match.team_b}</p>
                  <p className="font-bold text-accent">{oddsB.toFixed(2)}x</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[8px] text-muted-foreground">
                <span>◎{(bet.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-border/30 flex items-center justify-between text-[9px] text-muted-foreground">
              <span>No pool yet</span>
              <ChevronRight className="w-3 h-3 group-hover:text-primary transition-colors" />
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}