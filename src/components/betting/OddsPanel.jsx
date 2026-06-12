import React, { useState, useEffect } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function OddsPanel({ bet, match, onSelectOutcome, selectedOutcome, onRefreshOdds, isRefreshingOdds }) {
  const [loadingLiveOdds, setLoadingLiveOdds] = useState(false);
  
  // Auto-fetch live odds from The Odds API on mount
  useEffect(() => {
    if (!match?.team_a || !match?.team_b || loadingLiveOdds) return;
    
    const fetchLiveOdds = async () => {
      try {
        setLoadingLiveOdds(true);
        console.log('🔍 Fetching live odds for:', match.team_a, 'vs', match.team_b);
        const res = await base44.functions.invoke('fetchTheOddsApi', {});
        const matches = res.data.matches || [];
        console.log('📊 API returned', matches.length, 'matches');
        
        // Find matching teams (flexible matching for name variations)
        const matchedOdds = matches.find(m => {
          const home = m.home_team.toLowerCase();
          const away = m.away_team.toLowerCase();
          const teamA = match.team_a.toLowerCase();
          const teamB = match.team_b.toLowerCase();
          
          // Try exact match first
          if (home === teamA && away === teamB) return true;
          
          // Try partial match (e.g. "Czech Republic" vs "Czechia")
          if (home.includes(teamA) || teamA.includes(home)) {
            if (away.includes(teamB) || teamB.includes(away)) return true;
          }
          
          return false;
        });
        
        if (matchedOdds) {
          console.log('✅ Found live odds:', matchedOdds.odds);
          console.log('📝 Updating bet odds from', { odds_a: bet.odds_a, odds_b: bet.odds_b, odds_draw: bet.odds_draw }, 'to', { odds_a: matchedOdds.odds.home, odds_b: matchedOdds.odds.away, odds_draw: matchedOdds.odds.draw });
          // Update bet entity with live odds
          await base44.entities.Bet.update(bet.id, {
            odds_a: matchedOdds.odds.home,
            odds_b: matchedOdds.odds.away,
            odds_draw: matchedOdds.odds.draw,
            odds_bookmaker: matchedOdds.bookmaker_key || 'Pinnacle',
            odds_updated_at: new Date().toISOString(),
          });
          console.log('✅ Odds updated successfully');
        } else {
          console.log('❌ No matching odds found in API response. Available matches:', matches.map(m => `${m.home_team} vs ${m.away_team}`));
          console.log('🔍 Looking for:', match.team_a, 'vs', match.team_b);
        }
      } catch (err) {
        console.error('Failed to fetch live odds:', err);
      } finally {
        setLoadingLiveOdds(false);
      }
    };

    fetchLiveOdds();
  }, [match?.team_a, match?.team_b, bet?.id]);
  
  // Use fixed odds from The Odds API (odds_a/b/draw) or fallback to oracle_odds
  const fixedOddsA = bet?.odds_a || (bet?.oracle_odds_a ? bet.oracle_odds_a / 100 : 0);
  const fixedOddsB = bet?.odds_b || (bet?.oracle_odds_b ? bet.oracle_odds_b / 100 : 0);
  const fixedOddsDraw = bet?.odds_draw || (bet?.oracle_odds_draw ? bet.oracle_odds_draw / 100 : 0);
  
  const hasOdds = fixedOddsA > 0 || fixedOddsB > 0 || fixedOddsDraw > 0;

  const outcomes = [
    {
      key: 'a',
      label: bet?.outcome_a || match?.team_a,
      odds: fixedOddsA,
      pool: bet?.pool_a || 0,
      color: 'primary',
    },
    {
      key: 'draw',
      label: 'Draw',
      odds: fixedOddsDraw,
      pool: bet?.pool_draw || 0,
      color: 'yellow',
    },
    {
      key: 'b',
      label: bet?.outcome_b || match?.team_b,
      odds: fixedOddsB,
      pool: bet?.pool_b || 0,
      color: 'accent',
    },
  ];

  return (
    <div className="bg-card border border-border/50 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-xs flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          Dynamic Odds
          {loadingLiveOdds && (
            <span className="text-[9px] text-primary animate-pulse">fetching...</span>
          )}
          {bet?.odds_bookmaker && !loadingLiveOdds && (
            <span className="text-[9px] text-muted-foreground font-normal">via {bet.odds_bookmaker}</span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          {(() => {
            // Match status takes absolute precedence - if match is live, show "live" regardless of bet.status
            if (match?.status === 'live') {
              return (
                <Badge className="text-[9px] px-1.5 py-0 bg-destructive/20 text-destructive">
                  live
                </Badge>
              );
            }
            
            // If match finished or bet settled, show closed (gray)
            if (match?.status === 'finished' || bet?.status === 'settled') {
              return (
                <Badge className="text-[9px] px-1.5 py-0 bg-muted/20 text-muted-foreground">
                  closed
                </Badge>
              );
            }
            
            // Otherwise use bet.status (open/closed)
            const isOpen = bet?.status === 'open';
            return (
              <Badge className={`text-[9px] px-1.5 py-0 ${isOpen ? 'bg-accent/20 text-accent' : 'bg-destructive/20 text-destructive'}`}>
                {bet?.status || 'open'}
              </Badge>
            );
          })()}
          {onRefreshOdds && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefreshOdds} disabled={isRefreshingOdds}>
              <RefreshCw className={`w-3 h-3 ${isRefreshingOdds ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {!hasOdds && (
        <p className="text-xs text-muted-foreground text-center py-1">
          No odds available yet.
        </p>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {outcomes.map(o => (
          <button
            key={o.key}
            onClick={() => onSelectOutcome && onSelectOutcome(o.key)}
            disabled={!onSelectOutcome}
            className={`rounded-lg p-2 text-center border transition-all ${
              selectedOutcome === o.key
                ? o.color === 'primary' ? 'border-primary bg-primary/15'
                : o.color === 'accent' ? 'border-accent bg-accent/15'
                : 'border-yellow-500 bg-yellow-500/15'
                : 'border-border/40 bg-secondary/20 hover:border-border/70 hover:bg-secondary/40'
            } ${!onSelectOutcome ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <p className="text-[10px] text-muted-foreground mb-0.5 truncate">{o.label}</p>
            <p className={`font-heading font-black text-lg leading-tight ${
              o.color === 'primary' ? 'text-primary'
              : o.color === 'accent' ? 'text-accent'
              : 'text-yellow-400'
            }`}>
              {o.odds > 0 ? `${o.odds.toFixed(2)}x` : '—'}
            </p>
            {o.pool > 0 && (
              <p className="text-[9px] text-muted-foreground mt-0.5">
                ◎{o.pool.toFixed(2)}
              </p>
            )}
          </button>
        ))}
      </div>

      {bet?.odds_updated_at && (
        <p className="text-[9px] text-center text-muted-foreground/60">
          Updated {new Date(bet.odds_updated_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}