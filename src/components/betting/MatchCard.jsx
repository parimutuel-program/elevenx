import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { getTeamFlag } from '@/utils/flags';
import { base44 } from '@/api/base44Client';

const statusStyles = {
  upcoming: 'bg-secondary text-secondary-foreground',
  live: 'bg-destructive/20 text-destructive border border-destructive/30',
  finished: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

export default function MatchCard({ match, bet, index = 0, onOddsRefresh }) {
  const matchTime = match.match_time ? new Date(match.match_time) : null;
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefreshOdds = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsRefreshing(true);
    try {
      const res = await base44.functions.invoke('refreshMatchOdds', {
        bet_id: bet.id
      });
      
      if (res.data.error) {
        alert('❌ ' + res.data.error);
      } else if (res.data.success) {
        if (onOddsRefresh) onOddsRefresh();
        alert('✅ ' + res.data.message);
      } else {
        alert('⚠️ ' + (res.data.message || 'Failed to fetch odds'));
      }
    } catch (err) {
      alert('❌ Error: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const lpA = bet?.lp_amount_a || 0;
  const lpB = bet?.lp_amount_b || 0;
  const lpDraw = bet?.lp_amount_draw || 0;
  const totalLP = lpA + lpB + lpDraw;
  
  // Use authoritative odds_a/b/draw values (same as OddsPanel)
  const oddsA = bet?.odds_a || (bet?.oracle_odds_a ? bet.oracle_odds_a / 100 : 0);
  const oddsB = bet?.odds_b || (bet?.oracle_odds_b ? bet.oracle_odds_b / 100 : 0);
  const oddsDraw = bet?.odds_draw || (bet?.oracle_odds_draw ? bet.oracle_odds_draw / 100 : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link to={`/match/${match.id}`} className="group block">
        <div className="relative rounded-2xl p-4 sm:p-5 transition-all duration-300 border border-primary/20 bg-card">
          {/* Inner content */}
          <div className="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-[10px] sm:text-xs text-muted-foreground font-semibold truncate max-w-[60%] sm:max-w-none">
              {match.group_stage || 'World Cup 2026'}
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {bet && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRefreshOdds}
                  disabled={isRefreshing}
                  className="h-5 w-5 sm:h-6 sm:w-6 p-0 text-muted-foreground hover:text-primary flex-shrink-0"
                  title="Refresh odds (Admin only)"
                >
                  <RefreshCw className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              )}
              <Badge className={`text-[9px] sm:text-xs font-semibold uppercase tracking-wider ${statusStyles[match.status] || statusStyles.upcoming} flex-shrink-0`}>
                {match.status === 'live' && <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-destructive animate-pulse mr-1" />}
                <span className="hidden sm:inline">{match.status}</span>
                <span className="sm:hidden">{match.status === 'live' ? 'LIVE' : match.status === 'finished' ? 'FT' : match.status}</span>
              </Badge>
            </div>
          </div>

          {/* Match Matchup */}
          <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
            {/* Team A */}
            <div className="flex-1 text-center">
              <div className="text-2xl sm:text-3xl mb-1 sm:mb-1.5">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
              <p className="text-[10px] sm:text-xs text-foreground truncate font-medium">{match.team_a}</p>
            </div>

            {/* Score/VS */}
            <div className="flex flex-col items-center gap-1 px-2 sm:px-3 flex-shrink-0">
              {match.status === 'finished' || match.status === 'live' ? (
                <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base font-bold">
                  <span>{match.score_a ?? 0}</span>
                  <span className="text-muted-foreground text-xs sm:text-sm">-</span>
                  <span>{match.score_b ?? 0}</span>
                </div>
              ) : (
                <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded">VS</span>
              )}
              {matchTime && (
                <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap font-medium">
                  {format(matchTime, 'MMM d')}
                </span>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <div className="text-2xl sm:text-3xl mb-1 sm:mb-1.5">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
              <p className="text-[10px] sm:text-xs text-foreground truncate font-medium">{match.team_b}</p>
            </div>
          </div>

          {/* Odds/Pool */}
          {bet ? (
            <div className="pt-2.5 sm:pt-3 border-t border-border/50">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-2 sm:mb-2.5">
                <div className={`rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-xs border ${lpA > 0 ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-[9px] sm:text-xs text-muted-foreground truncate">{match.team_a.split(' ').pop()}</p>
                  <p className="font-bold text-primary text-xs sm:text-sm">{oddsA > 0 ? oddsA.toFixed(2) + 'x' : '—'}</p>
                </div>
                <div className={`rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-xs border ${lpDraw > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Draw</p>
                  <p className="font-bold text-yellow-400 text-xs sm:text-sm">{oddsDraw > 0 ? oddsDraw.toFixed(2) + 'x' : '—'}</p>
                </div>
                <div className={`rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-xs border ${lpB > 0 ? 'bg-accent/10 border-accent/20' : 'bg-accent/5 border-accent/10'}`}>
                  <p className="text-[9px] sm:text-xs text-muted-foreground truncate">{match.team_b.split(' ').pop()}</p>
                  <p className="font-bold text-accent text-xs sm:text-sm">{oddsB > 0 ? oddsB.toFixed(2) + 'x' : '—'}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                <span>◎{(bet.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ) : (
            <div className="pt-2.5 sm:pt-3 border-t border-border/30 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
              <span>No pool</span>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:text-primary transition-colors" />
            </div>
          )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}