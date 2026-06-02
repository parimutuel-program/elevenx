import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Users, ChevronRight } from 'lucide-react';
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
  
  // Use oracle fixed odds (stored in basis points, e.g. 200 = 2.00x)
  const oracleOddsA = (bet?.oracle_odds_a || 200) / 100;
  const oracleOddsB = (bet?.oracle_odds_b || 300) / 100;
  const oracleOddsDraw = (bet?.oracle_odds_draw || 320) / 100;
  
  // Dynamic odds only if there's actual liquidity
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
        <div className="relative bg-card border border-border/50 rounded-2xl p-5 hover:border-primary/30 transition-all duration-300 hover:shadow-[0_0_30px_-10px_hsl(45,100%,51%,0.15)]">
          {/* Status badge */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground font-medium">
              {match.group_stage || 'World Cup 2026'}
            </span>
            <Badge className={`text-[10px] font-semibold uppercase tracking-wider ${statusStyles[match.status] || statusStyles.upcoming}`}>
              {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mr-1.5" />}
              {match.status}
            </Badge>
          </div>

          {/* Teams with Flags */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-4xl shadow-lg">
                {getTeamFlag(match.team_a, match.team_a_flag)}
              </div>
              <p className="font-heading font-bold text-xs text-foreground truncate w-full text-center">{match.team_a}</p>
            </div>

            <div className="flex flex-col items-center gap-2 px-3">
              {match.status === 'finished' || match.status === 'live' ? (
                <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2">
                  <span className="text-3xl font-heading font-bold text-foreground">{match.score_a ?? 0}</span>
                  <span className="text-muted-foreground text-lg">-</span>
                  <span className="text-3xl font-heading font-bold text-foreground">{match.score_b ?? 0}</span>
                </div>
              ) : (
                <span className="text-xs font-bold text-primary px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl shadow-sm">VS</span>
              )}
              {matchTime && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {format(matchTime, 'MMM d · HH:mm')}
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 flex items-center justify-center text-4xl shadow-lg">
                {getTeamFlag(match.team_b, match.team_b_flag)}
              </div>
              <p className="font-heading font-bold text-xs text-foreground truncate w-full text-center">{match.team_b}</p>
            </div>
          </div>

          {/* Bet info */}
          {bet && (
            <div className="mt-4 pt-3 border-t border-border/50">
              {/* Always show oracle odds */}
              <div className={`grid gap-2 mb-2 ${oracleOddsDraw ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className={`${lpA > 0 ? 'bg-primary/10' : 'bg-primary/5'} rounded-lg px-2 py-1.5 text-center border ${lpA > 0 ? 'border-primary/20' : 'border-primary/10'}`}>
                  <p className="text-[10px] text-muted-foreground truncate">{match.team_a}</p>
                  <p className="font-heading font-bold text-xs text-primary">
                    {oddsA.toFixed(2)}x
                  </p>
                  {lpA === 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">◎0.00 LP avail.</p>
                  )}
                </div>
                {oracleOddsDraw && (
                  <div className={`${lpDraw > 0 ? 'bg-yellow-500/10' : 'bg-yellow-500/5'} rounded-lg px-2 py-1.5 text-center border ${lpDraw > 0 ? 'border-yellow-500/20' : 'border-yellow-500/10'}`}>
                    <p className="text-[10px] text-muted-foreground">Draw</p>
                    <p className="font-heading font-bold text-xs text-yellow-400">
                      {oddsDraw.toFixed(2)}x
                    </p>
                    {lpDraw === 0 && (
                      <p className="text-[9px] text-muted-foreground mt-0.5">◎0.00 LP avail.</p>
                    )}
                  </div>
                )}
                <div className={`${lpB > 0 ? 'bg-accent/10' : 'bg-accent/5'} rounded-lg px-2 py-1.5 text-center border ${lpB > 0 ? 'border-accent/20' : 'border-accent/10'}`}>
                  <p className="text-[10px] text-muted-foreground truncate">{match.team_b}</p>
                  <p className="font-heading font-bold text-xs text-accent">
                    {oddsB.toFixed(2)}x
                  </p>
                  {lpB === 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">◎0.00 LP avail.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {bet.total_bettors || 0} bettors · Pool ◎{(bet.total_pool || 0).toLocaleString()}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          )}
          {!bet && (
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
              <span>No pool yet</span>
              <ChevronRight className="w-4 h-4 group-hover:text-primary transition-colors" />
            </div>
          )}

          {/* Venue */}
          {match.venue && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {match.venue}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}