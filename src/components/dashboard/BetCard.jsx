import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, TrendingDown, Trophy, Wallet, ExternalLink, Zap, Target, PieChart, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { calculatePoolShare } from '@/utils/parimutuel';

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

  // Fetch match data to get team flags
  const { data: match } = useQuery({
    queryKey: ['match', bet.match_id],
    queryFn: async () => {
      const matches = await base44.entities.Match.filter({ id: bet.match_id });
      return matches[0];
    },
    enabled: !!bet.match_id,
  });

  // Determine which flag to show based on backed outcome
  const outcomeFlag = bet.outcome === 'a' ? match?.team_a_flag : bet.outcome === 'b' ? match?.team_b_flag : '🤝';
  const outcomeTeam = bet.outcome === 'a' ? match?.team_a : bet.outcome === 'b' ? match?.team_b : 'Draw';

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
      // Always show dialog - for db_only claims, show success immediately
      if (data.db_only) {
        // DB-only claim - show success dialog with no transaction
        setClaimInstruction({ db_only: true, message: data.message, payout: bet.potential_payout });
        setClaimDialogOpen(true);
      } else {
        // Show transaction signer dialog
        setClaimInstruction(data);
        setClaimDialogOpen(true);
      }
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
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
    
    // Show success message
    alert(`🎉 Congratulations! You claimed ◎${(bet.potential_payout || 0).toFixed(4)} SOL!\n\nTransaction: ${signature.slice(0, 8)}...${signature.slice(-8)}\nView on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`);
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
        offerId: bet.offer_id || null
      });
    } catch (err) {
      console.error('[BetCard] finalizeWithdrawal error:', err);
    }
    // Invalidate queries to refresh UI - bet will disappear or update
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
    setWithdrawDialogOpen(false);
    // Show success alert
    alert(`✓ Withdrawal successful! ◎${bet.amount.toFixed(4)} SOL returned to your wallet`);
  };

  const canClaim = bet.status === 'won';
  const canRefund = bet.status === 'refunded';
  const isCompleted = ['lost', 'claimed', 'void'].includes(bet.status);
  
  // LP bet: role='lp' with unmatched liquidity - can withdraw
  const isLp = bet.role === 'lp';
  const unmatched = isLp && (bet.status === 'pending' || bet.status === 'active') ? (bet.liquidity_unmatched || bet.amount) : 0;
  const canWithdraw = isLp && unmatched > 0 && (bet.status === 'pending' || bet.status === 'active');
  
  // Parimutuel LP bet: role='lp' with no offer_id - displays as pool share, not matching progress
  const isParimutuelLp = bet.role === 'lp' && !bet.offer_id;
  
  // For parimutuel bets: calculate pool share instead of match progress
  const poolShare = isParimutuelLp ? calculatePoolShare(bet.amount, bet.total_pool || bet.amount) : 0;
  const isParimutuelActive = isParimutuelLp && (bet.status === 'pending' || bet.status === 'active');
  
  // For fixed-odds bets: calculate match progress (how much of the bet is matched)
  const matchProgress = !isParimutuelActive && (bet.status === 'pending' || bet.status === 'active') && bet.amount > 0
    ? Math.min(100, Math.round(((bet.amount - (unmatched || 0)) / bet.amount) * 100))
    : 100;
  const isFullyMatched = matchProgress === 100 && (bet.status === 'pending' || bet.status === 'active');

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
      <Dialog open={claimDialogOpen && claimInstruction} onOpenChange={handleCloseClaimDialog}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Claim Winnings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {claimSignature ? (
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-6 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-accent" />
                  </div>
                </div>
                <div>
                  <h3 className="font-heading font-bold text-xl text-accent mb-1">🎉 Congratulations!</h3>
                  <p className="text-sm text-muted-foreground">Your winnings have been claimed</p>
                </div>
                <div className="bg-accent/20 border border-accent/40 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Claim Amount</p>
                  <p className="font-heading font-bold text-3xl text-accent">◎{(bet.potential_payout || 0).toFixed(4)} SOL</p>
                  <p className="text-xs text-muted-foreground mt-2">Funds transferred to your wallet</p>
                </div>
                <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] text-muted-foreground">Transaction Signature</p>
                  <p className="text-xs font-mono text-primary break-all">{claimSignature}</p>
                </div>
                <a
                  href={`https://solscan.io/tx/${claimSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button
                    variant="outline"
                    className="w-full h-11 font-heading font-bold rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View on Solscan →
                  </Button>
                </a>
                <Button
                  variant="secondary"
                  onClick={handleCloseClaimDialog}
                  className="w-full h-10 text-sm rounded-xl"
                >
                  Close
                </Button>
              </div>
            ) : claimInstruction?.db_only ? (
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
                <CheckCircle className="w-8 h-8 text-accent mx-auto mb-2" />
                <p className="font-heading font-bold text-sm text-accent mb-1">✓ Claim Processed</p>
                <p className="font-heading font-bold text-2xl text-accent">◎{(claimInstruction.payout || bet.potential_payout || 0).toFixed(4)} SOL</p>
                <p className="text-xs text-muted-foreground mt-2">Status updated to claimed</p>
                <p className="text-xs text-muted-foreground mt-1">SOL payout will be processed by admin</p>
                <Button
                  variant="outline"
                  onClick={handleCloseClaimDialog}
                  className="w-full mt-4 h-10 text-sm rounded-xl border-border/50"
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
        className="h-full"
      >
        <Card className="bg-[#1c1c1c] border border-primary/20 rounded-2xl overflow-hidden h-full flex flex-col">
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="p-5 space-y-4 flex-1 flex flex-col">
              {/* Header with Flag */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                  {/* Status Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
                    <StatusIcon className="w-6 h-6" />
                  </div>
                  {/* Outcome Flag & Label */}
                  <div className="flex items-center gap-2 flex-shrink-0 bg-secondary/50 px-3 py-2 rounded-xl border border-border/50">
                    <span className="text-2xl">{outcomeFlag || '🏆'}</span>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Backed</p>
                      <p className="text-sm font-heading font-bold text-foreground truncate max-w-[120px]">{outcomeTeam || bet.outcome_label}</p>
                    </div>
                  </div>
                  {/* Match Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-heading font-bold text-lg truncate">{bet.match_title || 'Match'}</h3>
                      <Badge className={`text-[10px] border ${config.color}`}>{config.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {bet.role === 'lp' ? (
                        <span className="text-primary font-semibold">⚡ Liquidity Provider</span>
                      ) : (
                        <span className="text-accent font-semibold">🎯 Bettor</span>
                      )}
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
              <div className="grid grid-cols-3 gap-3 bg-[#1a1a1a] rounded-xl p-4 border border-border/30">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {bet.betCount && bet.betCount > 1 ? 'Total Stake' : 'Stake'}
                  </p>
                  <p className="font-heading font-bold text-foreground">◎{(bet.totalAmount || bet.amount)?.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Potential</p>
                  <p className="font-heading font-bold text-primary">◎{(bet.totalPayout || bet.potential_payout || 0).toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {bet.betCount && bet.betCount > 1 ? 'Bets' : 'Role'}
                  </p>
                  <p className="font-heading font-bold text-accent capitalize">
                    {bet.betCount && bet.betCount > 1 ? `${bet.betCount} Bets` : (bet.role === 'lp' ? 'LP' : 'Bettor')}
                  </p>
                </div>
              </div>

              {/* Pool Share Display - For parimutuel LP bets only */}
              {isParimutuelActive && (
                <div className="bg-gradient-to-br from-accent/5 to-primary/5 border border-accent/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-accent" />
                      <span className="text-xs font-bold text-muted-foreground">
                        Your Pool Share
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-accent animate-pulse" />
                      <span className="text-sm font-heading font-bold text-accent">{poolShare.toFixed(2)}%</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground text-center">
                    You own {poolShare.toFixed(2)}% of the total pool (◎{bet.total_pool?.toFixed(4)})
                  </div>
                </div>
              )}

              {/* Match Progress Gauge - For fixed-odds bets only */}
              {!isParimutuelActive && (bet.status === 'pending' || bet.status === 'active') && (
                <div className="bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className={`w-4 h-4 ${isFullyMatched ? 'text-accent' : 'text-primary'}`} />
                      <span className="text-xs font-bold text-muted-foreground">
                        {isFullyMatched ? '✅ Fully Matched' : '⏳ Matching Progress'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isFullyMatched && <Zap className="w-4 h-4 text-accent animate-pulse" />}
                      <span className="text-sm font-heading font-bold text-primary">{matchProgress}%</span>
                    </div>
                  </div>
                  <Progress value={matchProgress} className="h-2 bg-secondary/50" />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Matched: ◎{(bet.amount - (unmatched || 0)).toFixed(4)}</span>
                    {unmatched > 0 && <span>Unmatched: ◎{unmatched.toFixed(4)}</span>}
                  </div>
                </div>
              )}

              {/* Action Buttons - Push to bottom */}
              <div className="flex gap-2 mt-auto pt-2">
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