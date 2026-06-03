import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, TrendingDown, Trophy, Wallet, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getFlagEmoji } from '@/utils/flags';

const statusConfig = {
  active:   { color: 'bg-primary/10 text-primary border-primary/20', icon: Clock, label: 'Active' },
  pending:  { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock, label: 'Pending' },
  won:      { color: 'bg-accent/20 text-accent border-accent/20', icon: TrendingUp, label: 'Won' },
  lost:     { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: TrendingDown, label: 'Lost' },
  claimed:  { color: 'bg-accent/20 text-accent border-accent/20', icon: Trophy, label: 'Claimed' },
  refunded: { color: 'bg-secondary text-secondary-foreground border-border', icon: Trophy, label: 'Refunded' },
  void:     { color: 'bg-muted text-muted-foreground border-border', icon: Clock, label: 'Void' },
};

export default function BetCard({ bet, index, walletAddress, onRefundRequest }) {
  const queryClient = useQueryClient();
  const config = statusConfig[bet.status] || statusConfig.active;
  const StatusIcon = config.icon;

  const claimMutation = useMutation({
    mutationFn: async () => {
      console.log('[BetCard] Claiming bet:', bet.id, 'wallet:', walletAddress);
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
      }
      const res = await base44.functions.invoke('claimWinnings', { 
        userBetId: bet.id,
        walletAddress: walletAddress 
      });
      console.log('[BetCard] Claim response:', res.data);
      if (res.data.error) {
        throw new Error(res.data.error + (res.data.debug ? ' - ' + JSON.stringify(res.data.debug) : ''));
      }
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myBets'] }),
  });

  const claimRefundMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('claimRefund', { userBetId: bet.id });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      onRefundRequest({
        userBetId: bet.id,
        refundAmount: bet.amount,
        solanaInstruction: data.solana_instruction,
      });
    },
  });

  const canClaim = bet.status === 'won';
  const canRefund = bet.status === 'refunded';
  const isCompleted = ['lost', 'claimed', 'void'].includes(bet.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
                  <StatusIcon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-heading font-bold text-lg truncate">{bet.match_title || 'Match'}</h3>
                    <Badge className={`text-[10px] border ${config.color}`}>{config.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Backed <span className="text-primary font-semibold">{bet.outcome_label}</span>
                  </p>
                </div>
              </div>
              <Link to={`/match/${bet.match_id}`}>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 bg-secondary/30 rounded-xl p-4">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Stake</p>
                <p className="font-heading font-bold text-foreground">◎{bet.amount?.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Potential</p>
                <p className="font-heading font-bold text-primary">◎{bet.potential_payout?.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Status</p>
                <p className="font-heading font-bold text-accent capitalize">{bet.status}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {canClaim && (
                <Button
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending}
                  className="flex-1 h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-xl"
                >
                  {claimMutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Claim ◎{bet.potential_payout?.toFixed(4)}
                    </>
                  )}
                </Button>
              )}
              {canRefund && (
                <Button
                  onClick={() => claimRefundMutation.mutate()}
                  disabled={claimRefundMutation.isPending}
                  className="flex-1 h-11 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-bold rounded-xl border border-yellow-500/30"
                >
                  {claimRefundMutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Claim Refund
                    </>
                  )}
                </Button>
              )}
              {isCompleted && (
                <div className="flex-1 text-center py-2 text-sm text-muted-foreground">
                  {bet.status === 'claimed' && (
                    <span className="text-accent font-bold">◎{bet.actual_payout?.toFixed(4)} claimed</span>
                  )}
                  {bet.status === 'lost' && <span>Bet lost</span>}
                  {bet.status === 'void' && <span>Bet voided</span>}
                </div>
              )}
              {!canClaim && !canRefund && !isCompleted && (
                <Link to={`/match/${bet.match_id}`} className="flex-1">
                  <Button variant="outline" className="w-full h-11 rounded-xl border-border/50">
                    View Match
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}