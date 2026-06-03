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
          // Update bet entity with live odds
          await base44.entities.Bet.update(bet.id, {
            odds_a: matchedOdds.odds.home,
            odds_b: matchedOdds.odds.away,
            odds_draw: matchedOdds.odds.draw,
            odds_bookmaker: 'Pinnacle',
            odds_updated_at: new Date().toISOString(),
          });
        } else {
          console.log('❌ No matching odds found');
        }
      } catch (err) {
        console.error('Failed to fetch live odds:', err);
      } finally {
        setLoadingLiveOdds(false);
      }
    };

    fetchLiveOdds();
  }, [match?.team_a, match?.team_b, bet?.id]);
  
  // Use odds_a/b/draw first, fallback to oracle_odds (convert from basis points to decimal)
  const oddsA = bet?.odds_a || (bet?.oracle_odds_a ? bet.oracle_odds_a / 100 : 0);
  const oddsB = bet?.odds_b || (bet?.oracle_odds_b ? bet.oracle_odds_b / 100 : 0);
  const oddsDraw = bet?.odds_draw || (bet?.oracle_odds_draw ? bet.oracle_odds_draw / 100 : 0);
  
  const hasOdds = oddsA > 0 || oddsB > 0 || oddsDraw > 0;

  const outcomes = [
    {
      key: 'a',
      label: bet?.outcome_a || match?.team_a,
      odds: oddsA,
      pool: bet?.pool_a || 0,
      color: 'primary',
    },
    {
      key: 'draw',
      label: 'Draw',
      odds: oddsDraw,
      pool: bet?.pool_draw || 0,
      color: 'yellow',
    },
    {
      key: 'b',
      label: bet?.outcome_b || match?.team_b,
      odds: oddsB,
      pool: bet?.pool_b || 0,
      color: 'accent',
    },
  ];

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Fixed Odds
          {loadingLiveOdds && (
            <span className="text-[9px] text-primary animate-pulse">Fetching live...</span>
          )}
          {bet?.odds_bookmaker && !loadingLiveOdds && (
            <span className="text-[10px] text-muted-foreground font-normal">via {bet.odds_bookmaker}</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <Badge className={`text-[10px] ${bet?.status === 'open' ? 'bg-accent/20 text-accent' : 'bg-secondary text-secondary-foreground'}`}>
            {bet?.status}
          </Badge>
          {onRefreshOdds && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefreshOdds} disabled={isRefreshingOdds}>
              <RefreshCw className={`w-3 h-3 ${isRefreshingOdds ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {!hasOdds && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No odds available yet. Add a TheStatsAPI match ID to fetch live odds.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {outcomes.map(o => (
          <button
            key={o.key}
            onClick={() => onSelectOutcome && onSelectOutcome(o.key)}
            disabled={!onSelectOutcome}
            className={`rounded-xl p-3 text-center border-2 transition-all ${
              selectedOutcome === o.key
                ? o.color === 'primary' ? 'border-primary bg-primary/10'
                : o.color === 'accent' ? 'border-accent bg-accent/10'
                : 'border-yellow-500 bg-yellow-500/10'
                : 'border-border/40 bg-secondary/20 hover:border-border/70'
            } ${!onSelectOutcome ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <p className="text-xs text-muted-foreground mb-1 truncate">{o.label}</p>
            <p className={`font-heading font-black text-2xl ${
              o.color === 'primary' ? 'text-primary'
              : o.color === 'accent' ? 'text-accent'
              : 'text-yellow-400'
            }`}>
              {o.odds > 0 ? `${o.odds.toFixed(2)}x` : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">◎{o.pool.toFixed(2)} pooled</p>
          </button>
        ))}
      </div>

      {bet?.odds_updated_at && (
        <p className="text-[10px] text-center text-muted-foreground">
          Odds updated {new Date(bet.odds_updated_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}