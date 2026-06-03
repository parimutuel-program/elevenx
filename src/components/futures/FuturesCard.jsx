import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Globe, Star, Lock, ChevronRight, Droplets } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function FuturesCard({ market, index, selected, onSelect, onBet }) {
  const [expanded, setExpanded] = useState(false);
  const visibleOutcomes = expanded ? market.outcomes.slice(0, 12) : market.outcomes.slice(0, 6);

  const totalPool = market.outcomes.reduce((sum, o) => sum + (o.pool || 0), 0);
  const totalLpOffers = market.outcomes.reduce((sum, o) => sum + (o.lp_offers || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ delay: index * 0.06 }}
      className="bg-card border border-border/50 rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{market.icon}</span>
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
              <h3 className="font-heading font-bold text-base">{market.title}</h3>
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
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" /> 
            On-chain
          </span>
        </div>
      </div>

      {/* Outcomes grid with "Big Jar" visualization */}
      <div className="px-5 pb-2">
        {/* Big Jar Summary */}
        <div className="mb-4 bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/10 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5" />
              Liquidity Pool
            </p>
            <Badge className="text-[9px] bg-primary/10 text-primary border border-primary/20">
              {market.outcomes.length} Outcomes
            </Badge>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-heading font-black text-primary">◎{totalPool.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">Total liquidity across all outcomes</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-heading font-bold text-accent">{totalLpOffers}</p>
              <p className="text-[9px] text-muted-foreground">Active LP jars</p>
            </div>
          </div>
          {/* Visual pool meter */}
          <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
              style={{ width: `${Math.min(100, (totalPool / 100) * 100)}%` }}
            />
          </div>
        </div>

        {/* Individual Outcome Cards (Mini Jars) */}
        <div className="grid grid-cols-2 gap-2">
          {visibleOutcomes.map((o) => {
            const isSelected = selected?.marketId === market.id && selected?.outcomeLabel === o.label;
            const hasLiquidity = (o.pool || 0) > 0 || (o.lp_offers || 0) > 0;
            
            return (
              <button 
                key={o.label}
                onClick={() => onSelect(isSelected ? null : { marketId: market.id, outcomeLabel: o.label })}
                className={`flex flex-col p-3 rounded-xl border-2 transition-all text-left relative overflow-hidden ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : hasLiquidity
                    ? 'border-accent/30 bg-accent/5 hover:border-accent/50'
                    : 'border-border/40 bg-secondary/20 hover:border-border'
                }`}>
                {/* Mini Jar indicator */}
                {hasLiquidity && (
                  <div className="absolute top-0 right-0 w-8 h-8 opacity-10">
                    <Droplets className="w-full h-full text-accent" />
                  </div>
                )}
                
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg shrink-0">{o.flag}</span>
                  <span className={`font-heading font-bold text-xs truncate ${isSelected ? 'text-primary' : ''}`}>
                    {o.label}
                  </span>
                </div>
                
                <div className="w-full mt-auto">
                  <div className="flex justify-between items-center mb-1">
                    <p className={`font-heading font-black text-base ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                      {o.odds.toFixed(2)}x
                    </p>
                    {hasLiquidity && (
                      <Badge className="text-[8px] bg-accent/10 text-accent border border-accent/20">
                        ◎{(o.pool || 0).toFixed(1)}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Mini jar progress */}
                  {hasLiquidity && (
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${Math.min(100, (o.pool / (totalPool || 1)) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Show more */}
      {market.outcomes.length > 6 && (
        <button 
          onClick={() => setExpanded(v => !v)}
          className="w-full py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 border-t border-border/30 mt-2"
        >
          {expanded ? 'Show less' : `+${market.outcomes.length - 6} more outcomes`}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}

      {/* Bet slip preview */}
      {selected?.marketId === market.id && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: 'auto' }}
          className="mx-5 mb-5 bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2"
        >
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-bold text-primary">Futures Bet Slip</p>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Your pick</span>
            <span className="font-bold">{selected.outcomeLabel}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Fixed odds</span>
            <span className="font-bold text-primary">
              {market.outcomes.find(o => o.label === selected.outcomeLabel)?.odds.toFixed(2)}x
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Available liquidity</span>
            <span className="font-bold text-accent">
              ◎{market.outcomes.find(o => o.label === selected.outcomeLabel)?.pool.toFixed(2) || '0.00'}
            </span>
          </div>
          <div className="h-px bg-border/30 my-1" />
          <Button 
            onClick={() => onBet && onBet(market, selected.outcomeLabel)}
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
              <><Lock className="w-3 h-3 mr-1.5" /> {market.status === 'coming_soon' ? 'Opening soon' : 'Closed'}</>
            )}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}