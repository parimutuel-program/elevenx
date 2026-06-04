import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, Wallet, ExternalLink, ArrowUpCircle, DollarSign, Percent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function LpPositionCard({ position, index, walletAddress, onWithdrawRequest }) {
  const queryClient = useQueryClient();
  const matchRate = position.liquidity_deposited > 0 
    ? Math.round((position.liquidity_matched / position.liquidity_deposited) * 100) 
    : 0;

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('withdrawLiquidity', { 
        walletAddress, 
        userBetId: position.id 
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      onWithdrawRequest({
        positionId: position.id,
        offerId: data.offerId,
        withdrawAmount: position.liquidity_unmatched,
        solanaInstruction: data.solana_instruction,
      });
    },
  });

  const canWithdraw = position.liquidity_unmatched > 0 && position.status !== 'settled';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="h-full"
    >
      <Card className="bg-card border border-primary/30 rounded-2xl overflow-hidden h-full">
        <CardContent className="p-0 h-full">
          <div className="p-5 space-y-4 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-heading font-bold text-lg truncate">{position.match_title || 'Market'}</h3>
                    <Badge className="text-[10px] border bg-primary/10 text-primary border-primary/20">LP Position</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Provided liquidity for <span className="text-primary font-semibold">{position.outcome_label}</span> pool
                  </p>
                </div>
              </div>
              <Link to={`/match/${position.match_id}`}>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Liquidity Stats Grid */}
            <div className="grid grid-cols-3 gap-3 bg-secondary/30 rounded-xl p-4">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Capital Deposited
                </p>
                <p className="font-heading font-bold text-foreground">◎{position.liquidity_deposited?.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <ArrowUpCircle className="w-3 h-3" /> Matched
                </p>
                <p className="font-heading font-bold text-accent">◎{position.liquidity_matched?.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Available to Withdraw
                </p>
                <p className="font-heading font-bold text-yellow-400">◎{position.liquidity_unmatched?.toFixed(4)}</p>
              </div>
            </div>

            {/* Match Rate Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Utilization Rate</span>
                <span className="font-bold text-primary">{matchRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all" 
                  style={{ width: `${matchRate}%` }} 
                />
              </div>
            </div>

            {/* Potential Yield */}
            {position.potential_yield > 0 && (
              <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-accent" />
                  <span className="text-xs text-muted-foreground">Estimated Yield</span>
                </div>
                <span className="font-bold text-accent">◎{position.potential_yield?.toFixed(4)}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {canWithdraw ? (
                <Button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="flex-1 h-11 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-bold rounded-xl border border-yellow-500/30"
                >
                  {withdrawMutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Remove Liquidity
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex-1 text-center py-2 text-sm text-muted-foreground bg-secondary/30 rounded-xl">
                  {position.status === 'fully_matched' ? 'Fully Utilized' : 
                   position.status === 'settled' ? 'Position Settled' : 'No Liquidity Available'}
                </div>
              )}
              <Link to={`/match/${position.match_id}`} className="flex-1">
                <Button variant="outline" className="w-full h-11 rounded-xl border-border/50">
                  View Market
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}