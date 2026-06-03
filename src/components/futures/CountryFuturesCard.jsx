import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Droplets, Trophy, Medal, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CountryFuturesCard({ market, index, selected, onSelect, onBet }) {
  const [selectedOutcome, setSelectedOutcome] = useState(null);

  const totalPool = market.outcomes.reduce((sum, o) => sum + (o.pool || 0), 0);
  const totalLpOffers = market.outcomes.reduce((sum, o) => sum + (o.lp_offers || 0), 0);

  const positionIcons = {
    '1st': <Trophy className="w-4 h-4" />,
    '2nd': <Medal className="w-4 h-4" />,
    '3rd': <Award className="w-4 h-4" />,
  };

  const positionColors = {
    '1st': 'from-yellow-500/20 to-amber-500/5 border-yellow-500/30',
    '2nd': 'from-slate-400/20 to-gray-400/5 border-slate-400/30',
    '3rd': 'from-amber-700/20 to-orange-800/5 border-amber-700/30',
  };

  const positionBadgeColors = {
    '1st': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    '2nd': 'bg-slate-400/10 text-slate-300 border-slate-400/20',
    '3rd': 'bg-amber-700/10 text-amber-600 border-amber-700/20',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-card border border-border/50 rounded-2xl overflow-hidden"
    >
      {/* Header with Country Flag */}
      <div className="p-5 pb-3 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 flex items-center justify-center text-4xl shadow-lg">
              {market.country_flag}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge className={`text-[9px] border ${
                  market.category === 'tournament' ? 'bg-primary/10 text-primary border-primary/20' :
                  market.category === 'player' ? 'bg-accent/10 text-accent border-accent/20' :
                  'bg-secondary text-secondary-foreground border-border'
                }`}>
                  {market.category === 'tournament' ? 'Tournament' : market.category === 'player' ? 'Player' : 'Special'}
                </Badge>
                {market.status === 'open' && (
                  <Badge className="text-[9px] bg-accent/10 text-accent border border-accent/20">
                    <Droplets className="w-2.5 h-2.5 mr-1" />
                    LP Active
                  </Badge>
                )}
              </div>
              <h3 className="font-heading font-bold text-lg text-white">{market.country}</h3>
              <p className="text-xs text-muted-foreground">{market.subtitle}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">Total Pool</p>
            <p className="font-heading font-bold text-sm text-primary">◎{totalPool.toFixed(2)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{totalLpOffers} LP offers</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> 
            Closes {new Date(market.open_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" /> 
            Fixed odds
          </span>
        </div>
      </div>

      {/* Three Outcomes - 1st, 2nd, 3rd Place */}
      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-3">
          {market.outcomes.map((outcome) => {
            const isSelected = selectedOutcome === outcome.position;
            const hasLiquidity = (outcome.pool || 0) > 0 || (outcome.lp_offers || 0) > 0;
            
            return (
              <button
                key={outcome.position}
                onClick={() => {
                  setSelectedOutcome(isSelected ? null : outcome.position);
                  onSelect(isSelected ? null : { 
                    marketId: market.id, 
                    outcomeLabel: outcome.label,
                    position: outcome.position,
                    odds: outcome.odds 
                  });
                }}
                className={`relative overflow-hidden rounded-xl border-2 p-3 transition-all ${
                  positionColors[outcome.position]
                } ${
                  isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                }`}
              >
                {/* Position Icon & Badge */}
                <div className="flex items-center justify-between mb-2">
                  <div className={`flex items-center gap-1.5 ${
                    outcome.position === '1st' ? 'text-yellow-400' :
                    outcome.position === '2nd' ? 'text-slate-300' :
                    'text-amber-600'
                  }`}>
                    {positionIcons[outcome.position]}
                    <Badge className={`text-[8px] font-bold ${positionBadgeColors[outcome.position]}`}>
                      {outcome.position} Place
                    </Badge>
                  </div>
                  {hasLiquidity && (
                    <Droplets className="w-3 h-3 text-accent/50" />
                  )}
                </div>

                {/* Odds Display */}
                <div className="text-center mb-2">
                  <p className={`font-heading font-black text-2xl ${
                    isSelected ? 'text-primary' : 'text-white'
                  }`}>
                    {outcome.odds.toFixed(2)}x
                  </p>
                  <p className="text-[9px] text-muted-foreground">Payout</p>
                </div>

                {/* LP Pool */}
                {hasLiquidity && (
                  <div className="bg-secondary/30 rounded-lg p-1.5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[8px] text-muted-foreground">Pool</span>
                      <span className="text-[9px] font-bold text-accent">◎{outcome.pool.toFixed(1)}</span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-accent to-accent/60 rounded-full"
                        style={{ width: `${Math.min(100, (outcome.pool / (totalPool || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {!hasLiquidity && (
                  <div className="bg-secondary/10 rounded-lg p-1.5 text-center">
                    <span className="text-[8px] text-muted-foreground">No liquidity yet</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bet Slip */}
      {selectedOutcome && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mx-5 mb-5 bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2"
        >
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-bold text-primary">Futures Bet Slip</p>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Country</span>
            <span className="font-bold flex items-center gap-1">
              {market.country_flag} {market.country}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Position</span>
            <span className="font-bold">
              {market.outcomes.find(o => o.position === selectedOutcome)?.position} Place
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Fixed odds</span>
            <span className="font-bold text-primary">
              {market.outcomes.find(o => o.position === selectedOutcome)?.odds.toFixed(2)}x
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Available liquidity</span>
            <span className="font-bold text-accent">
              ◎{market.outcomes.find(o => o.position === selectedOutcome)?.pool.toFixed(2) || '0.00'}
            </span>
          </div>
          <div className="h-px bg-border/30 my-1" />
          <Button
            onClick={() => onBet && onBet(market, selectedOutcome)}
            disabled={market.status !== 'open'}
            className={`w-full h-9 text-xs font-heading font-bold rounded-xl ${
              market.status === 'open'
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                : 'bg-primary/50 text-primary-foreground cursor-not-allowed'
            }`}
          >
            {market.status === 'open' ? (
              'Place Futures Bet'
            ) : (
              'Market Closed'
            )}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}