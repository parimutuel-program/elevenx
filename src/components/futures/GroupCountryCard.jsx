import React from 'react';
import { motion } from 'framer-motion';
import { Lock, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function GroupCountryCard({ market, onSelect }) {
  const outcomes = market.outcomes || [];
  const firstPlace = outcomes.find(o => o.position === '1st');
  const secondPlace = outcomes.find(o => o.position === '2nd');
  const thirdPlace = outcomes.find(o => o.position === '3rd');

  const totalPool = outcomes.reduce((sum, o) => sum + (o.pool || 0), 0);
  const totalLpOffers = outcomes.reduce((sum, o) => sum + (o.lp_offers || 0), 0);

  const isOpen = market.status === 'open';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-2xl overflow-hidden border border-border/50 bg-card hover:border-primary/30 transition-all duration-300"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-card/95" />
      
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-3xl overflow-hidden ${
              isOpen ? 'border-border/40 bg-secondary/30' : 'border-border/20 bg-secondary/20 grayscale'
            }`}>
              {market.country_flag || '🌍'}
            </div>
            <div>
              <h3 className="font-heading font-bold text-lg text-foreground">{market.country}</h3>
              <div className="flex items-center gap-2 mt-1">
                {isOpen ? (
                  <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold px-2 py-0">
                    OPEN
                  </Badge>
                ) : (
                  <Badge className="text-[9px] bg-secondary text-muted-foreground border border-border px-2 py-0">
                    <Lock className="w-2.5 h-2.5 mr-1" />
                    SOON
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Outcomes Grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { place: firstPlace, position: '1st', label: '1st', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
            { place: secondPlace, position: '2nd', label: '2nd', color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/20' },
            { place: thirdPlace, position: '3rd', label: '3rd', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' }
          ].map(({ place, position, label, color, bg, border }) => (
            <button
              key={position}
              onClick={() => isOpen && place && onSelect(market, place)}
              disabled={!isOpen || !place}
              className={`rounded-xl p-3 border transition-all duration-200 ${
                isOpen && place
                  ? `${bg} ${border} hover:border-${color.split('-')[1]}-400/40 hover:bg-${color.split('-')[1]}-400/15`
                  : 'border-border/20 bg-secondary/10 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className={`font-heading font-bold text-lg ${color}`}>
                  {place?.odds ? `${place.odds.toFixed(2)}x` : '--'}
                </p>
                {place?.pool > 0 && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    ◎{(place.pool / 1000).toFixed(1)}K
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Stats Footer */}
        <div className="rounded-xl p-3.5 border border-border/30 bg-secondary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">Pool</p>
                <p className="font-heading font-bold text-sm text-primary">◎{(totalPool / 1000).toFixed(2)}K</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">LP Offers</p>
              <p className="font-heading font-bold text-sm text-foreground">{totalLpOffers}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}