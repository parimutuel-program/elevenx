import React from 'react';
import { motion } from 'framer-motion';

/**
 * Fixed-odds outcome selector.
 * Shows oracle-fixed odds (e.g. 2.10x) for each outcome and available LP liquidity.
 */
export default function OddsBar({ bet, selected, onSelect, canSelect = true }) {
  if (!bet) return null;

  const outcomes = [
    {
      key: 'a',
      label: bet.outcome_a,
      oddsBps: bet.oracle_odds_a || 200,
      liquidity: bet.lp_amount_a || 0,
      matched: bet.backed_amount_a || 0,
      color: 'primary',
    },
    ...(bet.outcome_draw ? [{
      key: 'draw',
      label: bet.outcome_draw || 'Draw',
      oddsBps: bet.oracle_odds_draw || 300,
      liquidity: bet.lp_amount_draw || 0,
      matched: bet.backed_amount_draw || 0,
      color: 'yellow',
    }] : []),
    {
      key: 'b',
      label: bet.outcome_b,
      oddsBps: bet.oracle_odds_b || 300,
      liquidity: bet.lp_amount_b || 0,
      matched: bet.backed_amount_b || 0,
      color: 'accent',
    },
  ];

  const colorMap = {
    primary: { border: 'border-primary', bg: 'bg-primary/5', text: 'text-primary', badge: 'bg-primary/10 text-primary' },
    accent:  { border: 'border-accent',  bg: 'bg-accent/5',  text: 'text-accent',  badge: 'bg-accent/10 text-accent' },
    yellow:  { border: 'border-yellow-500', bg: 'bg-yellow-500/5', text: 'text-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400' },
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        {outcomes.map((o) => {
          const c = colorMap[o.color];
          const odds = (o.oddsBps / 100).toFixed(2);
          const available = (o.liquidity - o.matched).toFixed(2);
          const isSelected = selected === o.key;

          return (
            <button
              key={o.key}
              onClick={() => canSelect && onSelect(o.key)}
              disabled={!canSelect}
              className={`flex-1 min-w-[100px] p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected
                  ? `${c.border} ${c.bg} shadow-[0_0_20px_-5px_rgba(0,0,0,0.3)]`
                  : 'border-border/50 bg-card hover:border-border'
              } ${!canSelect ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
            >
              <p className="font-heading font-bold text-sm truncate">{o.label}</p>

              {/* Fixed odds — the headline number */}
              <p className={`text-2xl font-heading font-black mt-1 ${isSelected ? c.text : 'text-foreground'}`}>
                {odds}x
              </p>

              {/* LP liquidity available */}
              <p className="text-[10px] text-muted-foreground mt-1">
                ◎{Number(available) > 0 ? available : '0'} available
              </p>

              {Number(available) <= 0 && (
                <span className="text-[9px] text-yellow-400 font-medium mt-0.5 block">⚠ No LP — bet pending</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Matched vs liquidity bars */}
      <div className="space-y-1.5">
        {outcomes.map((o) => {
          const pct = o.liquidity > 0 ? Math.min((o.matched / o.liquidity) * 100, 100) : 0;
          const c   = colorMap[o.color];
          return (
            <div key={o.key} className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="w-16 truncate">{o.label}</span>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    o.color === 'primary' ? 'bg-primary' : o.color === 'accent' ? 'bg-accent' : 'bg-yellow-500'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <span>{pct.toFixed(0)}% matched</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}