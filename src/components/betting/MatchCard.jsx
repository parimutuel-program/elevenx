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
        <div className="relative rounded-2xl p-5 transition-all duration-300 border border-primary/20"
             style={{
               background: 'linear-gradient(145deg, rgba(15,10,30,0.95) 0%, rgba(26,16,64,0.9) 100%)',
             }}>
          {/* Inner content */}
          <div className="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground font-semibold">
              {match.group_stage || 'World Cup 2026'}
            </span>
            <Badge className={`text-xs font-semibold uppercase tracking-wider ${statusStyles[match.status] || statusStyles.upcoming}`}>
              {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mr-1.5" />}
              {match.status}
            </Badge>
          </div>

          {/* Match Matchup */}
          <div className="flex items-center justify-between gap-3 mb-4">
            {/* Team A */}
            <div className="flex-1 text-center">
              <div className="text-3xl mb-1.5">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
              <p className="text-xs text-foreground truncate font-medium">{match.team_a}</p>
            </div>

            {/* Score/VS */}
            <div className="flex flex-col items-center gap-1.5 px-3">
              {match.status === 'finished' || match.status === 'live' ? (
                <div className="flex items-center gap-2 text-base font-bold">
                  <span>{match.score_a ?? 0}</span>
                  <span className="text-muted-foreground text-sm">-</span>
                  <span>{match.score_b ?? 0}</span>
                </div>
              ) : (
                <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded">VS</span>
              )}
              {matchTime && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(matchTime, 'MMM d')}
                </span>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <div className="text-3xl mb-1.5">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
              <p className="text-xs text-foreground truncate font-medium">{match.team_b}</p>
            </div>
          </div>

          {/* Odds/Pool */}
          {bet ? (
            <div className="pt-3 border-t border-border/50">
              <div className={`grid gap-2 mb-2.5 ${oracleOddsDraw ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className={`rounded-lg px-2 py-1.5 text-center text-xs border ${lpA > 0 ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-muted-foreground truncate">{match.team_a}</p>
                  <p className="font-bold text-primary text-sm">{oddsA.toFixed(2)}x</p>
                </div>
                {oracleOddsDraw && (
                  <div className={`rounded-lg px-2 py-1.5 text-center text-xs border ${lpDraw > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
                    <p className="text-muted-foreground">Draw</p>
                    <p className="font-bold text-yellow-400 text-sm">{oddsDraw.toFixed(2)}x</p>
                  </div>
                )}
                <div className={`rounded-lg px-2 py-1.5 text-center text-xs border ${lpB > 0 ? 'bg-accent/10 border-accent/20' : 'bg-accent/5 border-accent/10'}`}>
                  <p className="text-muted-foreground truncate">{match.team_b}</p>
                  <p className="font-bold text-accent text-sm">{oddsB.toFixed(2)}x</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>◎{(bet.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ) : (
            <div className="pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
              <span>No pool yet</span>
              <ChevronRight className="w-4 h-4 group-hover:text-primary transition-colors" />
            </div>
          )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}