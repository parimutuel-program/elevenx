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
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
    >
      <Link to={`/match/${match.id}`} className="group block">
        <div className="relative rounded-xl p-2.5 sm:p-3 transition-all duration-300 border border-primary/20 bg-card">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[8px] sm:text-[9px] text-muted-foreground font-semibold truncate">
              {match.group_stage || 'World Cup 2026'}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {bet && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRefreshOdds}
                  disabled={isRefreshing}
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-primary flex-shrink-0"
                  title="Refresh odds (Admin only)"
                >
                  <RefreshCw className={`w-2 h-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              )}
              <Badge className={`text-[8px] sm:text-[9px] font-semibold uppercase tracking-wider ${statusStyles[match.status] || statusStyles.upcoming} flex-shrink-0`}>
                {match.status === 'live' && <span className="w-1 h-1 rounded-full bg-destructive animate-pulse mr-0.5" />}
                <span className="hidden sm:inline">{match.status}</span>
                <span className="sm:hidden">{match.status === 'live' ? 'LIVE' : match.status === 'finished' ? 'FT' : match.status}</span>
              </Badge>
            </div>
          </div>

          {/* Match Matchup */}
          <div className="flex items-center justify-between gap-1 mb-1.5">
            {/* Team A */}
            <div className="flex-1 text-center">
              <div className="text-lg sm:text-xl mb-0.5">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
              <p className="text-[8px] sm:text-[9px] text-foreground truncate font-medium">{match.team_a}</p>
            </div>

            {/* Score/VS */}
            <div className="flex flex-col items-center gap-0.5 px-1 flex-shrink-0">
              {match.status === 'finished' || match.status === 'live' ? (
                <div className="flex items-center gap-1 text-xs sm:text-sm font-bold">
                  <span>{match.score_a ?? 0}</span>
                  <span className="text-muted-foreground text-[10px] sm:text-xs">-</span>
                  <span>{match.score_b ?? 0}</span>
                </div>
              ) : (
                <span className="text-[8px] sm:text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">VS</span>
              )}
              {matchTime && (
                <span className="text-[8px] sm:text-[9px] text-muted-foreground whitespace-nowrap font-medium">
                  {format(matchTime, 'MMM d')}
                </span>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <div className="text-lg sm:text-xl mb-0.5">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
              <p className="text-[8px] sm:text-[9px] text-foreground truncate font-medium">{match.team_b}</p>
            </div>
          </div>

          {/* Odds/Pool */}
          {bet ? (
            <div className="pt-2 border-t border-border/50">
              <div className="grid grid-cols-3 gap-1 mb-1.5">
                <div className={`rounded-md px-1 py-0.5 text-center text-[9px] border ${lpA > 0 ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-[8px] text-muted-foreground truncate">{match.team_a.split(' ').pop()}</p>
                  <p className="font-bold text-primary text-[10px] sm:text-xs">{oddsA > 0 ? oddsA.toFixed(2) + 'x' : '—'}</p>
                </div>
                <div className={`rounded-md px-1 py-0.5 text-center text-[9px] border ${lpDraw > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
                  <p className="text-[8px] text-muted-foreground">Draw</p>
                  <p className="font-bold text-yellow-400 text-[10px] sm:text-xs">{oddsDraw > 0 ? oddsDraw.toFixed(2) + 'x' : '—'}</p>
                </div>
                <div className={`rounded-md px-1 py-0.5 text-center text-[9px] border ${lpB > 0 ? 'bg-accent/10 border-accent/20' : 'bg-accent/5 border-accent/10'}`}>
                  <p className="text-[8px] text-muted-foreground truncate">{match.team_b.split(' ').pop()}</p>
                  <p className="font-bold text-accent text-[10px] sm:text-xs">{oddsB > 0 ? oddsB.toFixed(2) + 'x' : '—'}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-muted-foreground">
                <span>◎{(bet.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-border/30 flex items-center justify-between text-[9px] sm:text-[10px] text-muted-foreground">
              <span>No pool</span>
              <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:text-primary transition-colors" />
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}