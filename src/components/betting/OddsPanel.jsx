import React, { useState, useEffect } from 'react';
import { TrendingUp, RefreshCw, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { PhaseShiftBanner, calculateDynamicOdds, getBettingMode } from './PhaseShiftUtils';

export default function OddsPanel({ bet, match, onSelectOutcome, selectedOutcome, onRefreshOdds, isRefreshingOdds }) {
  const [loadingLiveOdds, setLoadingLiveOdds] = useState(false);
  const [allOffers, setAllOffers] = useState([]);
  
  // Fetch all LP offers to detect Phase Shift (fully matched = dynamic mode)
  useEffect(() => {
    if (!bet?.id) return;
    
    const fetchOffers = async () => {
      try {
        const offers = await base44.entities.BetOffer.filter({ bet_id: bet.id });
        setAllOffers(offers);
      } catch (err) {
        console.error('Failed to fetch offers for phase detection:', err);
      }
    };
    
    fetchOffers();
    
    // Refresh offers every 5 seconds to detect phase changes
    const interval = setInterval(fetchOffers, 5000);
    return () => clearInterval(interval);
  }, [bet?.id]);
  
  // Calculate total unmatched liquidity per outcome
  const getUnmatchedForOutcome = (outcome) => {
    return allOffers
      .filter(o => o.outcome === outcome && (o.status === 'open' || o.status === 'partially_matched'))
      .reduce((sum, o) => sum + (o.amount_unmatched || 0), 0);
  };
  
  const unmatchedA = getUnmatchedForOutcome('a');
  const unmatchedB = getUnmatchedForOutcome('b');
  const unmatchedDraw = getUnmatchedForOutcome('draw');
  
  // Phase Shift Detection: If ALL unmatched liquidity is gone for an outcome, it shifts to dynamic mode
  const isPhaseShiftedA = unmatchedA <= 0 && (bet?.pool_a || 0) > 0;
  const isPhaseShiftedB = unmatchedB <= 0 && (bet?.pool_b || 0) > 0;
  const isPhaseShiftedDraw = unmatchedDraw <= 0 && (bet?.pool_draw || 0) > 0;
  
  // Calculate Dynamic Parimutuel Odds (only if phase shifted)
  // Formula: (Total Pool / Outcome Pool) * (1 - Fee)
  const dynamicOddsA = calculateDynamicOdds(bet, 'a');
  const dynamicOddsB = calculateDynamicOdds(bet, 'b');
  const dynamicOddsDraw = calculateDynamicOdds(bet, 'draw');
  
  // Check if ANY outcome is in dynamic mode
  const hasAnyPhaseShift = isPhaseShiftedA || isPhaseShiftedB || isPhaseShiftedDraw;
  
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
  
  // Use odds_a/b/draw first, fallback to oracle_odds (convert from basis points to decimal)
  const fixedOddsA = bet?.odds_a || (bet?.oracle_odds_a ? bet.oracle_odds_a / 100 : 0);
  const fixedOddsB = bet?.odds_b || (bet?.oracle_odds_b ? bet.oracle_odds_b / 100 : 0);
  const fixedOddsDraw = bet?.odds_draw || (bet?.oracle_odds_draw ? bet.oracle_odds_draw / 100 : 0);
  
  // Display odds: only use dynamic once unmatched LP liquidity is exhausted (phase-shifted)
  const displayOddsA = isPhaseShiftedA ? (dynamicOddsA || fixedOddsA) : fixedOddsA;
  const displayOddsB = isPhaseShiftedB ? (dynamicOddsB || fixedOddsB) : fixedOddsB;
  const displayOddsDraw = isPhaseShiftedDraw ? (dynamicOddsDraw || fixedOddsDraw) : fixedOddsDraw;
  
  const hasOdds = displayOddsA > 0 || displayOddsB > 0 || displayOddsDraw > 0;

  const outcomes = [
    {
      key: 'a',
      label: bet?.outcome_a || match?.team_a,
      odds: displayOddsA,
      fixedOdds: fixedOddsA,
      dynamicOdds: dynamicOddsA,
      isPhaseShifted: isPhaseShiftedA,
      pool: bet?.pool_a || 0,
      unmatched: unmatchedA,
      color: 'primary',
    },
    {
      key: 'draw',
      label: 'Draw',
      odds: displayOddsDraw,
      fixedOdds: fixedOddsDraw,
      dynamicOdds: dynamicOddsDraw,
      isPhaseShifted: isPhaseShiftedDraw,
      pool: bet?.pool_draw || 0,
      unmatched: unmatchedDraw,
      color: 'yellow',
    },
    {
      key: 'b',
      label: bet?.outcome_b || match?.team_b,
      odds: displayOddsB,
      fixedOdds: fixedOddsB,
      dynamicOdds: dynamicOddsB,
      isPhaseShifted: isPhaseShiftedB,
      pool: bet?.pool_b || 0,
      unmatched: unmatchedB,
      color: 'accent',
    },
  ];

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      {/* Phase Shift Status Banner */}
      {hasAnyPhaseShift && (
        <div className="bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 border border-accent/40 rounded-xl p-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent animate-pulse" />
          <div className="flex-1">
            <p className="text-[10px] font-bold text-accent uppercase tracking-wider">Dynamic Pool Mode Active</p>
            <p className="text-[9px] text-accent/80">Odds shift in real-time based on pool ratios</p>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {hasAnyPhaseShift ? 'Live Pool Odds' : 'Fixed Odds'}
          {loadingLiveOdds && (
            <span className="text-[9px] text-primary animate-pulse">Fetching live...</span>
          )}
          {bet?.odds_bookmaker && !loadingLiveOdds && !hasAnyPhaseShift && (
            <span className="text-[10px] text-muted-foreground font-normal">via {bet.odds_bookmaker}</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {(() => {
            const now = new Date().getTime();
            const closeTime = bet?.open_until ? new Date(bet.open_until).getTime() : 0;
            const isWindowClosed = closeTime > 0 && now > closeTime;
            const displayStatus = isWindowClosed ? 'closed' : (bet?.status || 'open');
            const isActuallyOpen = !isWindowClosed && bet?.status === 'open';
            
            return (
              <Badge className={`text-[10px] ${isActuallyOpen ? 'bg-accent/20 text-accent' : 'bg-destructive/20 text-destructive'}`}>
                {displayStatus}
              </Badge>
            );
          })()}
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
            className={`rounded-xl p-3 text-center border-2 transition-all relative overflow-hidden ${
              selectedOutcome === o.key
                ? o.color === 'primary' ? 'border-primary bg-primary/10'
                : o.color === 'accent' ? 'border-accent bg-accent/10'
                : 'border-yellow-500 bg-yellow-500/10'
                : 'border-border/40 bg-secondary/20 hover:border-border/70'
            } ${!onSelectOutcome ? 'cursor-default' : 'cursor-pointer'} ${
              o.isPhaseShifted ? 'ring-2 ring-accent/30 ring-offset-2 ring-offset-background' : ''
            }`}
          >
            {/* Phase Shift Indicator */}
            {o.isPhaseShifted && (
              <div className="absolute top-1 right-1">
                <Zap className="w-3 h-3 text-accent" />
              </div>
            )}
            
            <p className="text-xs text-muted-foreground mb-1 truncate">{o.label}</p>
            
            {/* Show odds change indicator for dynamic mode */}
            {o.isPhaseShifted && o.dynamicOdds && (
              <p className="text-[8px] text-accent font-bold mb-0.5">
                {o.dynamicOdds > o.fixedOdds ? '↑' : '↓'} Was {o.fixedOdds.toFixed(2)}x
              </p>
            )}
            
            <p className={`font-heading font-black text-2xl ${
              o.color === 'primary' ? 'text-primary'
              : o.color === 'accent' ? 'text-accent'
              : 'text-yellow-400'
            }`}>
              {o.odds > 0 ? `${o.odds.toFixed(2)}x` : '—'}
            </p>
            
            {/* Show unmatched liquidity if available, otherwise show pool only */}
            {o.unmatched > 0 ? (
              <p className="text-[10px] text-muted-foreground mt-1">
                ◎{o.unmatched.toFixed(2)} available @ {o.fixedOdds.toFixed(2)}x
              </p>
            ) : (
              <p className="text-[10px] text-accent font-bold mt-1">
                ◎{o.pool.toFixed(2)} pool
              </p>
            )}
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