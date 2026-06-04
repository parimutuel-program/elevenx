import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getTeamFlag } from '@/utils/flags';
import { DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function LiquidityDetailModal({ 
  open, 
  onClose, 
  bet, 
  match,
  onCommit 
}) {
  const [selectedOutcome, setSelectedOutcome] = useState('a');
  const [amount, setAmount] = useState('');

  if (!open || !bet || !match) return null;

  // Odds are already in decimal format (e.g., 1.42, 4.61), don't divide by 100
  const oddsA = bet.odds_a || bet.oracle_odds_a || 2;
  const oddsB = bet.odds_b || bet.oracle_odds_b || 3;
  const oddsDraw = bet.odds_draw || bet.oracle_odds_draw || 3.2;

  const outcomes = [
    { 
      key: 'a', 
      label: bet.outcome_a, 
      flag: getTeamFlag(match.team_a, match.team_a_flag),
      odds: oddsA,
      pool: bet.pool_a || 0 
    },
    { 
      key: 'draw', 
      label: 'Draw', 
      flag: '⚖️',
      odds: oddsDraw,
      pool: bet.pool_draw || 0 
    },
    { 
      key: 'b', 
      label: bet.outcome_b, 
      flag: getTeamFlag(match.team_b, match.team_b_flag),
      odds: oddsB,
      pool: bet.pool_b || 0 
    },
  ];

  const selectedOdds = outcomes.find(o => o.key === selectedOutcome)?.odds || 1;
  const potentialLiability = (parseFloat(amount || 0) * selectedOdds).toFixed(2);

  const handleCommit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    
    // Check market status first
    try {
      const statusRes = await base44.functions.invoke('checkMarketStatus', { match_id: bet.match_id });
      console.log('[LiquidityDetailModal] Market status:', statusRes.data);
      
      if (statusRes.data.status === 'not_created') {
        alert('Market not initialized on-chain. Please go to Admin panel and initialize the market first.');
        return;
      }
    } catch (err) {
      console.error('[LiquidityDetailModal] Failed to check market status:', err);
    }
    
    onCommit({
      bet,
      outcome: selectedOutcome,
      amount: parseFloat(amount),
      potentialLiability: parseFloat(potentialLiability)
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border/50 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div>
            <h2 className="font-heading font-black text-xl mb-2">Provide Liquidity</h2>
            <p className="text-xs text-muted-foreground">Select an outcome to cover and commit SOL</p>
          </div>

          {/* Match info */}
          <div className="bg-secondary/30 border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="text-3xl mb-1">{getTeamFlag(match.team_a, match.team_a_flag)}</div>
                <p className="font-heading font-bold text-sm">{match.team_a}</p>
              </div>
              <div className="flex flex-col items-center px-3">
                <span className="font-heading font-black text-primary text-lg">VS</span>
                <span className="text-[9px] text-muted-foreground">{match.group_stage}</span>
              </div>
              <div className="text-center flex-1">
                <div className="text-3xl mb-1">{getTeamFlag(match.team_b, match.team_b_flag)}</div>
                <p className="font-heading font-bold text-sm">{match.team_b}</p>
              </div>
            </div>
          </div>

          {/* Outcome selection */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Select outcome to cover (you profit if this team LOSES)
            </label>
            <div className="grid gap-2">
              {outcomes.map(o => (
                <button
                  key={o.key}
                  onClick={() => setSelectedOutcome(o.key)}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    selectedOutcome === o.key
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                      : 'border-border/50 bg-secondary/30 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{o.flag}</span>
                      <div className="text-left">
                        <p className="font-heading font-bold text-sm">{o.label}</p>
                        <p className="text-[10px] text-muted-foreground">Pool: ◎{o.pool.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-heading font-bold text-lg text-primary">{o.odds.toFixed(2)}x</p>
                      <p className="text-[9px] text-muted-foreground">Multiplier</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Amount to Commit (◎ SOL)
            </label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-lg font-heading font-bold focus:outline-none focus:border-primary/50"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              {[0.5, 1, 2, 5, 10].map(qa => (
                <button
                  key={qa}
                  onClick={() => setAmount(String(qa))}
                  className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                >
                  ◎{qa}
                </button>
              ))}
            </div>
          </div>

          {/* Potential liability */}
          {amount && parseFloat(amount) > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">💰</div>
                <p className="text-xs font-bold text-primary">Potential Payout</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">If {outcomes.find(o => o.key === selectedOutcome)?.label} wins:</p>
                  <p className="text-xs text-muted-foreground">You pay out</p>
                </div>
                <p className="font-heading font-bold text-xl text-primary">◎{potentialLiability}</p>
              </div>
              <div className="mt-2 pt-2 border-t border-primary/20">
                <p className="text-[9px] text-muted-foreground">
                  You keep your ◎{amount} stake + earn fees if they lose
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-border/50 text-sm font-medium hover:bg-secondary/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={!amount || parseFloat(amount) <= 0}
              className="flex-1 h-11 rounded-xl font-heading font-bold bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Commit ◎{amount || '0'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}