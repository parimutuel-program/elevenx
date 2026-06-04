import { Zap } from 'lucide-react';

/**
 * Calculate dynamic parimutuel odds for a phase-shifted outcome
 * Formula: (Total Pool / Outcome Pool) * (1 - Fee)
 */
export const calculateDynamicOdds = (bet, outcome) => {
  if (!bet) return null;
  
  const feePercent = (bet.fee_percent || 0) / 100;
  const totalPool = bet.total_pool || 0;
  const outcomePool = outcome === 'a' ? (bet.pool_a || 0) : outcome === 'b' ? (bet.pool_b || 0) : (bet.pool_draw || 0);
  
  if (totalPool <= 0 || outcomePool <= 0) return null;
  
  return (totalPool / outcomePool) * (1 - feePercent);
};

/**
 * Determine betting mode based on liquidity availability
 * Returns: 'fixed_lp' | 'dynamic_pool' | 'no_liquidity'
 */
export const getBettingMode = (selectedOutcome, totalLiquidityForOutcome, bet) => {
  if (!selectedOutcome) return 'no_liquidity';
  
  const isFullyMatched = totalLiquidityForOutcome <= 0 && (bet?.[`pool_${selectedOutcome}`] || 0) > 0;
  
  if (isFullyMatched) return 'dynamic_pool';
  if (totalLiquidityForOutcome > 0) return 'fixed_lp';
  return 'no_liquidity';
};

/**
 * Phase Shift Banner Component
 * Shows when any outcome has shifted to dynamic pool mode
 */
export const PhaseShiftBanner = ({ hasAnyPhaseShift }) => {
  if (!hasAnyPhaseShift) return null;
  
  return (
    <div className="bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 border border-accent/40 rounded-xl p-3 flex items-center gap-2">
      <Zap className="w-4 h-4 text-accent animate-pulse" />
      <div className="flex-1">
        <p className="text-[10px] font-bold text-accent uppercase tracking-wider">Dynamic Pool Mode Active</p>
        <p className="text-[9px] text-accent/80">Odds shift in real-time based on pool ratios</p>
      </div>
    </div>
  );
};