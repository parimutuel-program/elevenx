import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, TrendingDown, Trophy, Wallet, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

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
  
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimInstruction, setClaimInstruction] = useState(null);
  const [claimSignature, setClaimSignature] = useState(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawData, setWithdrawData] = useState(null);

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
      
      // If DB-only claim (voided market), update local bet status immediately
      if (res.data.db_only) {
        await base44.entities.UserBet.update(bet.id, { status: 'claimed' });
        return { db_only: true, message: res.data.message };
      }
      
      // Return solana instruction for signing
      return res.data;
    },
    onSuccess: (data) => {
      if (data.db_only) {
        alert(data.message);
        queryClient.invalidateQueries({ queryKey: ['myBets'] });
      } else {
        // Show transaction signer dialog
        setClaimInstruction(data);
        setClaimDialogOpen(true);
      }
    },
    onError: (err) => {
      console.error('[BetCard] Claim error:', err);
      alert('Claim failed: ' + err.message);
    }
  });

  const handleClaimTransactionSuccess = async (txResult) => {
    const signature = txResult.signature;
    setClaimSignature(signature);
    
    // Update bet status in DB
    await base44.entities.UserBet.update(bet.id, { status: 'claimed' });
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
  };

  const handleCloseClaimDialog = () => {
    setClaimDialogOpen(false);
    setClaimInstruction(null);
    setClaimSignature(null);
  };

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

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('withdrawUnmatchedLiquidity', {
        userBetId: bet.id,
        walletAddress
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setWithdrawData(data);
      setWithdrawDialogOpen(true);
    },
    onError: (err) => {
      alert('Withdraw failed: ' + err.message);
    }
  });

  const handleWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    // Commit withdrawal to DB
    try {
      await base44.functions.invoke('finalizeWithdrawal', {
        signature,
        userBetId: bet.id,
        offerId: bet.offer_id
      });
    } catch (err) {
      console.error('[BetCard] finalizeWithdrawal error:', err);
    }
    // Invalidate queries to refresh UI - bet will disappear or update
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
    setWithdrawDialogOpen(false);
  };

  const canClaim = bet.status === 'won';
  const canRefund = bet.status === 'refunded';
  const isCompleted = ['lost', 'claimed', 'void'].includes(bet.status);
  
  // Parimutuel LP bet: role='lp' with no offer_id - can withdraw full amount if pending/active
  const isParimutuelLp = bet.role === 'lp' && !bet.offer_id;
  const unmatched = isParimutuelLp && (bet.status === 'pending' || bet.status === 'active') ? bet.amount : (bet.liquidity_unmatched || 0);
  const canWithdraw = isParimutuelLp && unmatched > 0 && (bet.status === 'pending' || bet.status === 'active');

  return (
    <>
      {/* Withdraw Dialog for Parimutuel LP */}
      <Dialog open={withdrawDialogOpen && withdrawData} onOpenChange={() => setWithdrawDialogOpen(false)}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Wallet className="w-5 h-5 text-yellow-400" />
              Withdraw Unmatched Liquidity
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground">Withdraw Amount</p>
              <p className="font-heading font-bold text-2xl text-yellow-400">◎{withdrawData?.amount?.toFixed(4)} SOL</p>
              <p className="text-xs text-muted-foreground mt-2">Unmatched liquidity returned to wallet</p>
            </div>
            {withdrawData?.solana_instruction && (
              <SolanaTransactionSigner
                instruction={withdrawData.solana_instruction}
                amount={withdrawData.amount?.toFixed(4) || '0'}
                userBetId={bet.id}
                onSuccess={handleWithdrawSuccess}
                onError={() => setWithdrawDialogOpen(false)}
              />
            )}
            <Button
              variant="outline"
              onClick={() => setWithdrawDialogOpen(false)}
              className="w-full h-10 text-sm rounded-xl border-border/50"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Claim Dialog - Only render if we have a solana instruction */}
      <Dialog open={claimDialogOpen && claimInstruction && !claimInstruction.db_only} onOpenChange={handleCloseClaimDialog}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Claim Winnings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {claimSignature ? (
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Successfully Claimed!</p>
                <p className="font-heading font-bold text-2xl text-accent">◎{(bet.potential_payout || 0).toFixed(4)} SOL</p>
                <p className="text-xs text-muted-foreground mt-2">Funds transferred to your wallet</p>
                <div className="mt-3 pt-3 border-t border-accent/20">
                  <p className="text-xs text-muted-foreground mb-1">Transaction on Solana</p>
                  <a
                    href={`https://solscan.io/tx/${claimSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary text-xs font-bold hover:underline"
                  >
                    View on Solscan →
                    <span className="font-mono text-[10px] text-muted-foreground">{claimSignature.slice(0, 8)}...{claimSignature.slice(-8)}</span>
                  </a>
                </div>
                <Button
                  variant="outline"
                  onClick={handleCloseClaimDialog}
                  className="w-full mt-3 h-10 text-sm rounded-xl border-border/50"
                >
                  Close
                </Button>
              </div>
            ) : (
              <>
                <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
                  <p className="text-sm text-muted-foreground">Claim Amount</p>
                  <p className="font-heading font-bold text-2xl text-accent">◎{(bet.potential_payout || 0).toFixed(4)} SOL</p>
                  <p className="text-xs text-muted-foreground mt-2">Sign transaction to claim</p>
                </div>
                {claimInstruction?.solana_instruction && (
                  <SolanaTransactionSigner
                    instruction={claimInstruction.solana_instruction}
                    amount={(bet.potential_payout || 0).toFixed(4)}
                    userBetId={bet.id}
                    onSuccess={handleClaimTransactionSuccess}
                    onError={() => setClaimDialogOpen(false)}
                  />
                )}
                <Button
                  variant="outline"
                  onClick={handleCloseClaimDialog}
                  className="w-full h-10 text-sm rounded-xl border-border/50"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                  <p className="font-heading font-bold text-primary">◎{(bet.potential_payout || 0).toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Status</p>
                  <p className="font-heading font-bold text-accent capitalize">{bet.status}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {canWithdraw && (
                  <Button
                    onClick={() => withdrawMutation.mutate()}
                    disabled={withdrawMutation.isPending || withdrawDialogOpen}
                    className="flex-1 h-11 bg-yellow-500 hover:bg-yellow-500/90 text-white font-bold rounded-xl"
                  >
                    {withdrawMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Wallet className="w-4 h-4 mr-2" />
                        Withdraw ◎{unmatched.toFixed(4)}
                      </>
                    )}
                  </Button>
                )}
                {canClaim && (
                  <Button
                    onClick={() => claimMutation.mutate()}
                    disabled={claimMutation.isPending || claimDialogOpen}
                    className="flex-1 h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-xl"
                  >
                    {claimMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trophy className="w-4 h-4 mr-2" />
                        Claim ◎{(bet.potential_payout || 0).toFixed(4)}
                      </>
                    )}
                  </Button>
                )}
                {canRefund && (
                  <Button
                    onClick={() => claimRefundMutation.mutate()}
                    disabled={claimRefundMutation.isPending}
                    className="flex-1 h-11 bg-yellow-500 hover:bg-yellow-500/90 text-white font-bold rounded-xl"
                  >
                    {claimRefundMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}