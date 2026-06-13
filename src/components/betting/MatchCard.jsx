import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { getTeamFlag, getFlagColor } from '@/utils/flags';
import { base44 } from '@/api/base44Client';

const statusStyles = {
  upcoming: 'bg-primary/10 text-primary border border-primary/20',
  live: 'bg-destructive/20 text-destructive border border-destructive/30',
  finished: 'bg-muted text-muted-foreground border border-border/30',
  cancelled: 'bg-muted text-muted-foreground border border-border/30'
};

const statusLabels = {
  upcoming: 'Upcoming',
  live: 'Live',
  finished: 'Closed',
  cancelled: 'Cancelled'
};

export default function MatchCard({ match, bet, index = 0, onOddsRefresh }) {
  const matchTime = match.match_time ? new Date(match.match_time) : null;
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [liveMatch, setLiveMatch] = useState(match);
  
  // Use match image_url if available
  const matchImage = match.image_url || null;

  // Use database scores directly (no API calls to avoid rate limiting)
  useEffect(() => {
    setLiveMatch(prev => ({
      ...prev,
      score_a: match.score_a ?? 0,
      score_b: match.score_b ?? 0,
      status: match.status
    }));
  }, [match.score_a, match.score_b, match.status]);

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
      whileHover={{ y: -4 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}>
      
      <Link to={`/match/${match.id}`} className="group block">
        <div className="relative rounded-2xl overflow-hidden transition-all duration-300 border border-primary/20 h-full bg-[#1c1c1c]">
          {/* Match Image Header */}
          {matchImage && (
            <div className="relative h-40 -mx-4 -mt-4 mb-3 overflow-hidden">
              <img
                src={matchImage}
                alt={`${match.team_a} vs ${match.team_b}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,28,28,1) 0%, rgba(28,28,28,0.8) 50%, transparent 100%)' }} />
            </div>
          )}
          
          {/* Header */}
          <div className={`flex items-center justify-between ${matchImage ? 'mb-2' : 'mb-3'}`}>
            <span className="text-[10px] text-muted-foreground font-semibold truncate">
              {match.group_stage || 'World Cup 2026'}
            </span>
            <Badge className={`text-[9px] font-semibold uppercase tracking-wider flex-shrink-0 ${
              match.status === 'live' ? 'bg-destructive/20 text-destructive border border-destructive/30' :
              match.status === 'finished' ? 'bg-accent/20 text-accent border border-accent/30' :
              match.status === 'cancelled' ? 'bg-muted text-muted-foreground border border-border/30' :
              'bg-primary/10 text-primary border border-primary/20'
            }`}>
              {match.status === 'live' && <span className="w-1 h-1 rounded-full bg-destructive animate-pulse mr-1" />}
              {match.status === 'live' ? '● LIVE' :
               match.status === 'finished' ? '✓ FINISHED' :
               match.status === 'cancelled' ? 'CANCELLED' :
               'UPCOMING'}
            </Badge>
          </div>

          {/* Kickoff date & time */}
          {matchTime && (
            <div className="flex items-center gap-1.5 mb-3 bg-secondary/60 border border-border/50 rounded-lg px-2.5 py-1.5">
              <span className="text-[11px] font-bold text-foreground">{format(matchTime, 'MMM d')}</span>
              <span className="text-muted-foreground text-[10px]">·</span>
              <span className="text-[11px] font-semibold text-primary">{format(matchTime, 'h:mm a')}</span>
            </div>
          )}

          {/* Match Matchup with Live Scores */}
          <div className="flex items-center justify-between gap-2 mb-3">
            {/* Team A */}
            <div className="flex-1 text-center">
              <div className="w-14 h-14 mx-auto mb-1 flex items-center justify-center text-3xl">
                {getTeamFlag(match.team_a, match.team_a_flag)}
              </div>
              <p className="text-[10px] text-foreground truncate font-medium">{match.team_a}</p>
              {/* Score Badge - Team A */}
              {(match.status === 'live' || match.status === 'finished') && (
                <div className={`mt-1 flex items-center justify-center gap-1 rounded px-2 py-0.5 border ${
                  match.status === 'finished' ? 'bg-accent/10 border-accent/20' : 'bg-destructive/10 border-destructive/20'
                }`}>
                  <span className={`text-xs font-bold ${
                    match.status === 'live' ? 'text-destructive' : 'text-accent'
                  }`}>
                    {liveMatch.score_a ?? match.score_a ?? 0}
                  </span>
                </div>
              )}
            </div>

            {/* VS / Live Indicator */}
            <div className="flex flex-col items-center gap-1 px-2 flex-shrink-0">
              {match.status === 'live' ? (
                <>
                  <span className="text-[10px] font-bold text-muted-foreground">VS</span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    <span className="text-[9px] font-bold text-destructive">LIVE</span>
                  </div>
                </>
              ) : match.status === 'finished' ? (
                <>
                  <span className="text-[10px] font-bold text-muted-foreground">VS</span>
                  <span className="text-[9px] font-bold text-muted-foreground">FT</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-bold text-muted-foreground">VS</span>
                  {matchTime && (
                    <span className="text-[10px] text-muted-foreground font-medium">{format(matchTime, 'MMM d')}</span>
                  )}
                </>
              )}
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <div className="w-14 h-14 mx-auto mb-1 flex items-center justify-center text-3xl">
                {getTeamFlag(match.team_b, match.team_b_flag)}
              </div>
              <p className="text-[10px] text-foreground truncate font-medium">{match.team_b}</p>
              {/* Score Badge - Team B */}
              {(match.status === 'live' || match.status === 'finished') && (
                <div className={`mt-1 flex items-center justify-center gap-1 rounded px-2 py-0.5 border ${
                  match.status === 'finished' ? 'bg-accent/10 border-accent/20' : 'bg-destructive/10 border-destructive/20'
                }`}>
                  <span className={`text-xs font-bold ${
                    match.status === 'live' ? 'text-destructive' : 'text-accent'
                  }`}>
                    {liveMatch.score_b ?? match.score_b ?? 0}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Odds/Pool - Dimmed for finished matches */}
          {bet ?
          <div className={`pt-2.5 border-t ${match.status === 'finished' ? 'border-border/20 opacity-50' : 'border-border/50'}`}>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <div className={`rounded-lg px-1.5 py-1 text-center text-xs border ${lpA > 0 ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-[9px] text-muted-foreground truncate">{match.team_a.split(' ').pop()}</p>
                  <p className="font-bold text-primary text-xs">{oddsA > 0 ? oddsA.toFixed(2) + 'x' : '—'}</p>
                </div>
                <div className={`rounded-lg px-1.5 py-1 text-center text-xs border ${lpDraw > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
                  <p className="text-[9px] text-muted-foreground">Draw</p>
                  <p className="font-bold text-yellow-400 text-xs">{oddsDraw > 0 ? oddsDraw.toFixed(2) + 'x' : '—'}</p>
                </div>
                <div className={`rounded-lg px-1.5 py-1 text-center text-xs border ${lpB > 0 ? 'bg-accent/10 border-accent/20' : 'bg-accent/5 border-accent/10'}`}>
                  <p className="text-[9px] text-muted-foreground truncate">{match.team_b.split(' ').pop()}</p>
                  <p className="font-bold text-accent text-xs">{oddsB > 0 ? oddsB.toFixed(2) + 'x' : '—'}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>◎{(bet.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <ChevronRight className={`w-3.5 h-3.5 ${match.status === 'finished' ? 'text-muted-foreground/30' : 'text-muted-foreground group-hover:text-primary'} transition-colors`} />
              </div>
            </div> :

          <div className={`pt-2.5 border-t ${match.status === 'finished' ? 'border-border/20 opacity-50' : 'border-border/30'} flex items-center justify-between text-[10px] text-muted-foreground`}>
              <span>No pool</span>
              <ChevronRight className={`w-3.5 h-3.5 ${match.status === 'finished' ? 'text-muted-foreground/30' : 'text-muted-foreground group-hover:text-primary'} transition-colors`} />
            </div>
          }
        </div>
      </Link>
    </motion.div>);

}