import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getTeamFlag } from '@/utils/flags';
import { DollarSign, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';

export default function LiquidityDetailModal({ 
  open, 
  onClose, 
  bet, 
  match,
  onCommit,
  isLoading = false,
}) {
  const { isConnected, connect } = useWallet();
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
    if (!isConnected) {
      await connect();
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      console.warn('[LiquidityDetailModal] Invalid amount:', amount);
      return;
    }
    
    console.log('[LiquidityDetailModal] handleCommit called with:', { bet_id: bet.id, outcome: selectedOutcome, amount });
    
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
    
    console.log('[LiquidityDetailModal] Calling onCommit...');
    onCommit({
      bet,
      outcome: selectedOutcome,
      amount: parseFloat(amount),
      potentialLiability: parseFloat(potentialLiability)
    });
    console.log('[LiquidityDetailModal] onCommit completed');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border/50 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="p-4 space-y-3">
          {/* Header + Match info inline */}
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-black text-base">Provide Liquidity</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{getTeamFlag(match.team_a, match.team_a_flag)} {match.team_a}</span>
              <span className="text-primary font-bold">vs</span>
              <span>{match.team_b} {getTeamFlag(match.team_b, match.team_b_flag)}</span>
            </div>
          </div>

          {/* Outcome selection - compact */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block">
              Select outcome to cover (you profit if this team LOSES)
            </label>
            <div className="grid gap-1.5">
              {outcomes.map(o => (
                <button
                  key={o.key}
                  onClick={() => setSelectedOutcome(o.key)}
                  className={`px-3 py-2 rounded-lg border-2 transition-all ${
                    selectedOutcome === o.key
                      ? 'border-primary bg-primary/10'
                      : 'border-border/50 bg-secondary/30 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{o.flag}</span>
                      <div className="text-left">
                        <p className="font-heading font-bold text-xs">{o.label}</p>
                        <p className="text-[9px] text-muted-foreground">Pool: ◎{o.pool.toFixed(2)}</p>
                      </div>
                    </div>
                    <p className="font-heading font-bold text-sm text-primary">{o.odds.toFixed(2)}x</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Amount (◎ SOL)</label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-base font-heading font-bold focus:outline-none focus:border-primary/50"
            />
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {[0.5, 1, 2, 5, 10].map(qa => (
                <button
                  key={qa}
                  onClick={() => setAmount(String(qa))}
                  className="px-2.5 py-1 text-[10px] font-medium bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                >
                  ◎{qa}
                </button>
              ))}
            </div>
          </div>

          {/* Potential liability - compact */}
          {amount && parseFloat(amount) > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                If {outcomes.find(o => o.key === selectedOutcome)?.label} wins, you pay out
              </p>
              <p className="font-heading font-bold text-base text-primary">◎{potentialLiability}</p>
            </div>
          )}

          {/* Actions */}
          {!isConnected ? (
            <div className="bg-secondary/30 border border-border/50 rounded-xl p-4 text-center space-y-3">
              <Wallet className="w-8 h-8 text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Connect your Phantom wallet to provide liquidity</p>
              <Button
                onClick={async () => {
                  await connect();
                }}
                className="w-full h-10 font-heading font-bold rounded-xl text-sm"
                style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}
              >
                <Wallet className="w-4 h-4 mr-2" />
                Connect Phantom
              </Button>
            </div>
          ) : (
            <button
              onClick={handleCommit}
              disabled={!amount || parseFloat(amount) <= 0 || isLoading}
              className="w-full h-9 rounded-xl font-heading font-bold bg-primary hover:bg-primary/90 text-primary-foreground text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mx-auto" />
              ) : (
                `Commit ◎${amount || '0'}`
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}