import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Lock, TrendingUp, Trophy, Clock, ChevronRight, Zap, Star, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Static futures markets — to be wired to backend later
const FUTURES_MARKETS = [
  {
    id: 'winner-2026',
    category: 'Tournament',
    title: 'World Cup 2026 Winner',
    subtitle: 'Who will lift the trophy?',
    icon: '🏆',
    status: 'open',
    closesAt: 'Jun 11, 2026',
    totalVolume: 18420,
    outcomes: [
      { label: 'Brazil', flag: '🇧🇷', odds: 4.50, implied: '22%' },
      { label: 'France', flag: '🇫🇷', odds: 5.00, implied: '20%' },
      { label: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: 6.00, implied: '17%' },
      { label: 'Argentina', flag: '🇦🇷', odds: 6.50, implied: '15%' },
      { label: 'Spain', flag: '🇪🇸', odds: 7.00, implied: '14%' },
      { label: 'Germany', flag: '🇩🇪', odds: 9.00, implied: '11%' },
    ],
  },
  {
    id: 'top-scorer',
    category: 'Player',
    title: 'Golden Boot',
    subtitle: 'Top scorer of the tournament',
    icon: '👟',
    status: 'open',
    closesAt: 'Jun 11, 2026',
    totalVolume: 9870,
    outcomes: [
      { label: 'Kylian Mbappé', flag: '🇫🇷', odds: 5.50, implied: '18%' },
      { label: 'Erling Haaland', flag: '🇳🇴', odds: 6.00, implied: '17%' },
      { label: 'Vinicius Jr.', flag: '🇧🇷', odds: 7.00, implied: '14%' },
      { label: 'Harry Kane', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: 8.00, implied: '13%' },
      { label: 'Jude Bellingham', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: 9.00, implied: '11%' },
      { label: 'Lionel Messi', flag: '🇦🇷', odds: 12.00, implied: '8%' },
    ],
  },
  {
    id: 'finalist',
    category: 'Tournament',
    title: 'Finalist — Group Stage Qualifier',
    subtitle: 'Which region produces the finalist?',
    icon: '🌍',
    status: 'open',
    closesAt: 'Jun 11, 2026',
    totalVolume: 4210,
    outcomes: [
      { label: 'Europe', flag: '🌍', odds: 1.70, implied: '59%' },
      { label: 'South America', flag: '🌎', odds: 2.50, implied: '40%' },
      { label: 'North America', flag: '🌎', odds: 18.00, implied: '6%' },
      { label: 'Africa', flag: '🌍', odds: 35.00, implied: '3%' },
    ],
  },
  {
    id: 'total-goals',
    category: 'Tournament',
    title: 'Total Goals Scored',
    subtitle: 'Over/under for entire tournament',
    icon: '⚽',
    status: 'coming_soon',
    closesAt: 'Jun 11, 2026',
    totalVolume: 0,
    outcomes: [
      { label: 'Over 140.5', flag: '📈', odds: 1.90, implied: '53%' },
      { label: 'Under 140.5', flag: '📉', odds: 1.90, implied: '53%' },
    ],
  },
];

const CATEGORY_COLORS = {
  Tournament: 'bg-primary/10 text-primary border-primary/20',
  Player: 'bg-accent/10 text-accent border-accent/20',
};

export default function Futures() {
  const [selected, setSelected] = useState(null); // { marketId, outcomeLabel }

  const openMarkets = FUTURES_MARKETS.filter(m => m.status === 'open');
  const comingMarkets = FUTURES_MARKETS.filter(m => m.status === 'coming_soon');

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative rounded-3xl overflow-hidden p-7"
        style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #0d0520 50%, #0a1a2e 100%)' }}>
        {/* glow orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #a69cf2, transparent)' }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Futures Markets</span>
            <Badge className="ml-auto text-[10px] bg-primary/20 text-primary border border-primary/30">Beta</Badge>
          </div>
          <h1 className="font-heading font-black text-3xl text-white mb-2">Long-Range Bets</h1>
          <p className="text-white/50 text-sm max-w-sm">
            Bet on tournament outcomes before they happen. Fixed odds, locked in at time of placement.
          </p>
          <div className="flex gap-4 mt-5">
            {[
              { label: 'Open Markets', value: openMarkets.length },
              { label: 'Total Volume', value: `◎${(FUTURES_MARKETS.reduce((s,m) => s + m.totalVolume, 0) / 1000).toFixed(1)}K` },
              { label: 'Settlement', value: 'On-chain' },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-white font-heading font-bold text-lg">{s.value}</p>
                <p className="text-white/40 text-[10px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Open markets */}
      <section>
        <h2 className="font-heading font-bold text-base mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Open Markets
        </h2>
        <div className="space-y-4">
          {openMarkets.map((market, mi) => (
            <FuturesCard
              key={market.id}
              market={market}
              index={mi}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </div>
      </section>

      {/* Coming soon */}
      {comingMarkets.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-base mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Coming Soon
          </h2>
          <div className="space-y-3">
            {comingMarkets.map((market, mi) => (
              <motion.div key={market.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: mi * 0.05 }}
                className="bg-card border border-border/30 rounded-2xl p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{market.icon}</span>
                    <div>
                      <p className="font-heading font-bold text-sm">{market.title}</p>
                      <p className="text-xs text-muted-foreground">{market.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Opening soon</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* CTA banner */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="rounded-2xl border border-accent/20 bg-accent/5 p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-heading font-bold text-sm text-accent mb-1">Provide Futures Liquidity</p>
          <p className="text-xs text-muted-foreground">LPs can back futures outcomes and earn when bettors lose.</p>
        </div>
        <Button variant="outline" className="border-accent/40 text-accent hover:bg-accent/10 rounded-xl text-xs font-bold shrink-0"
          onClick={() => window.location.href = '/lp'}>
          Go to LP <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </motion.div>
    </div>
  );
}

function FuturesCard({ market, index, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const visibleOutcomes = expanded ? market.outcomes : market.outcomes.slice(0, 4);

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      className="bg-card border border-border/50 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{market.icon}</span>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge className={`text-[9px] border ${CATEGORY_COLORS[market.category] || 'bg-secondary text-secondary-foreground border-border'}`}>
                  {market.category}
                </Badge>
              </div>
              <h3 className="font-heading font-bold text-base">{market.title}</h3>
              <p className="text-xs text-muted-foreground">{market.subtitle}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">Volume</p>
            <p className="font-heading font-bold text-sm text-primary">◎{market.totalVolume.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Closes {market.closesAt}</span>
          <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-primary" /> Fixed odds</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> On-chain settlement</span>
        </div>
      </div>

      {/* Outcomes grid */}
      <div className="px-5 pb-2 grid grid-cols-2 gap-2">
        {visibleOutcomes.map((o) => {
          const isSelected = selected?.marketId === market.id && selected?.outcomeLabel === o.label;
          return (
            <button key={o.label}
              onClick={() => onSelect(isSelected ? null : { marketId: market.id, outcomeLabel: o.label })}
              className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border/40 bg-secondary/20 hover:border-border hover:bg-secondary/40'
              }`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{o.flag}</span>
                <span className="font-heading font-bold text-xs truncate">{o.label}</span>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`font-heading font-black text-base ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {o.odds.toFixed(2)}x
                </p>
                <p className="text-[9px] text-muted-foreground">{o.implied}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Show more */}
      {market.outcomes.length > 4 && (
        <button onClick={() => setExpanded(v => !v)}
          className="w-full py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1">
          {expanded ? 'Show less' : `+${market.outcomes.length - 4} more outcomes`}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}

      {/* Bet slip preview — shown when an outcome is selected */}
      {selected?.marketId === market.id && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="mx-5 mb-5 bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2 overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-bold text-primary">Futures Bet Slip</p>
            <Badge className="ml-auto text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/20">Coming Soon</Badge>
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
            <span className="text-muted-foreground">Settlement</span>
            <span className="font-bold">On-chain · After final</span>
          </div>
          <div className="h-px bg-border/30 my-1" />
          <Button disabled className="w-full h-9 text-xs font-heading font-bold rounded-xl bg-primary/50 text-primary-foreground cursor-not-allowed">
            <Lock className="w-3 h-3 mr-1.5" /> Betting opens soon
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}