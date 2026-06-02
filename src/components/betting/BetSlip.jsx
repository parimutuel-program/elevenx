import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertCircle, Clock } from 'lucide-react';

/**
 * Bet slip for fixed-odds hybrid model.
 * Shows locked-in payout = stake × oracle_odds at the moment of placing.
 */
export default function BetSlip({ bet, selectedOutcome, onPlaceBet, isPlacing }) {
  const [amount, setAmount] = useState('');
  const quickAmounts = [0.01, 0.05, 0.1, 0.25, 0.5];

  // Oracle odds for this outcome (in bps, e.g. 210 = 2.10x)
  const oddsField = selectedOutcome === 'a' ? 'oracle_odds_a' : selectedOutcome === 'b' ? 'oracle_odds_b' : 'oracle_odds_draw';
  const oddsBps   = bet?.[oddsField] || 200;
  const oddsMultiplier = oddsBps / 100;

  // LP liquidity available for this outcome
  const lpField      = selectedOutcome === 'a' ? 'lp_amount_a' : selectedOutcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
  const matchedField = selectedOutcome === 'a' ? 'backed_amount_a' : selectedOutcome === 'b' ? 'backed_amount_b' : 'backed_amount_draw';
  const lpTotal      = bet?.[lpField] || 0;
  const lpMatched    = bet?.[matchedField] || 0;
  const lpAvailable  = Math.max(0, lpTotal - lpMatched);

  const amountNum      = parseFloat(amount) || 0;
  const matchedAmount  = Math.min(amountNum, lpAvailable);
  const pendingAmount  = Math.max(0, amountNum - matchedAmount);

  // Gross payout = matched portion × odds. Net after 2% fee.
  const grossPayout = matchedAmount * oddsMultiplier;
  const fee         = grossPayout * (bet?.fee_percent || 200) / 10_000;
  const netPayout   = grossPayout - fee;

  const outcomeName = selectedOutcome === 'a' ? bet?.outcome_a : selectedOutcome === 'b' ? bet?.outcome_b : (bet?.outcome_draw || 'Draw');

  const handleSubmit = () => {
    if (amountNum <= 0) return;
    onPlaceBet(amountNum);
    setAmount('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-primary/20 rounded-2xl p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-bold text-sm">Bet Slip</h3>
        <span className="ml-auto text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {oddsMultiplier.toFixed(2)}x fixed
        </span>
      </div>

      {/* Your pick */}
      <div className="bg-secondary/50 rounded-xl p-3 mb-4">
        <p className="text-xs text-muted-foreground mb-1">Your pick</p>
        <p className="font-heading font-bold text-primary">{outcomeName}</p>
        <p className="text-xs text-muted-foreground mt-1">
          LP Liquidity: ◎{lpAvailable.toFixed(4)} available
        </p>
      </div>

      {/* Amount input */}
      <div className="mb-3">
        <label className="text-xs text-muted-foreground mb-1.5 block">Stake (◎ SOL)</label>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12"
        />
      </div>

      {/* Quick amounts */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {quickAmounts.map(qa => (
          <button
            key={qa}
            onClick={() => setAmount(String(qa))}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            ◎{qa}
          </button>
        ))}
      </div>

      {/* Payout breakdown */}
      <AnimatePresence>
        {amountNum > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 space-y-2"
          >
            {/* Matched portion */}
            {matchedAmount > 0 && (
              <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider">Matched (instant)</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Stake</span>
                  <span className="font-bold">◎{matchedAmount.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Odds</span>
                  <span className="font-bold text-primary">{oddsMultiplier.toFixed(2)}x</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Gross payout</span>
                  <span className="font-bold">◎{grossPayout.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Fee (2%)</span>
                  <span className="text-muted-foreground">−◎{fee.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-accent/20 pt-1.5">
                  <span className="font-bold text-accent">If you win</span>
                  <span className="font-bold text-accent">◎{netPayout.toFixed(4)}</span>
                </div>
              </div>
            )}

            {/* Pending portion */}
            {pendingAmount > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3 text-yellow-400" />
                  <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Pending (no LP)</p>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Pending stake</span>
                  <span className="font-bold text-yellow-400">◎{pendingAmount.toFixed(4)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Locked when LP liquidity becomes available. Refunded if never matched.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={handleSubmit}
        disabled={amountNum <= 0 || isPlacing}
        className="w-full h-12 font-heading font-bold text-base bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
      >
        {isPlacing ? (
          <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          `Place ◎${amountNum.toFixed(4)} Bet`
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
        <AlertCircle className="w-3 h-3" />
        Matched bets are final and non-refundable
      </p>
    </motion.div>
  );
}