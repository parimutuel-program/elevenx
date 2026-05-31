import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Shows open LP offers for a given outcome so other users can match them
export default function OfferBook({ offers = [], outcome, outcomeLabel, color = 'primary', onMatch, canMatch = true }) {
  const openOffers = offers.filter(o => o.outcome === outcome && (o.status === 'open' || o.status === 'partially_matched'));

  if (openOffers.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        No open offers for {outcomeLabel} yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {openOffers.map((offer, i) => (
        <motion.div
          key={offer.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${
            color === 'primary' ? 'border-primary/15 bg-primary/5' :
            color === 'accent' ? 'border-accent/15 bg-accent/5' :
            'border-yellow-500/15 bg-yellow-500/5'
          }`}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-bold ${
                color === 'primary' ? 'text-primary' :
                color === 'accent' ? 'text-accent' :
                'text-yellow-400'
              }`}>{outcomeLabel}</span>
              <Badge className={`text-[9px] py-0 ${
                offer.status === 'partially_matched' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-secondary text-secondary-foreground'
              }`}>
                {offer.status === 'partially_matched' ? 'partial' : 'open'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Available: <span className="font-bold text-foreground">${offer.amount_unmatched?.toFixed(2)}</span></span>
              <span>of ${offer.amount_offered?.toFixed(2)}</span>
            </div>
          </div>
          {canMatch && (
            <Button
              size="sm"
              onClick={() => onMatch(offer)}
              className={`h-8 text-xs font-bold rounded-lg ml-3 ${
                color === 'primary' ? 'bg-primary/10 hover:bg-primary/20 text-primary' :
                color === 'accent' ? 'bg-accent/10 hover:bg-accent/20 text-accent' :
                'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400'
              }`}
              variant="ghost"
            >
              Match
            </Button>
          )}
        </motion.div>
      ))}
    </div>
  );
}