import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, TrendingDown, Trophy, Wallet, ExternalLink, Zap, Target, PieChart, CheckCircle, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { calculatePoolShare } from '@/utils/parimutuel';
import ShareBetModal from '@/components/dashboard/ShareBetModal';

const statusConfig = {
  active: { color: 'bg-primary/5 text-primary border-primary/10', icon: Clock, label: 'Active' },
  pending: { color: 'bg-yellow-500/5 text-yellow-400 border-yellow-500/10', icon: Clock, label: 'Pending' },
  won: { color: 'bg-accent/5 text-accent border-accent/10', icon: TrendingUp, label: 'Won' },
  lost: { color: 'bg-destructive/5 text-destructive border-destructive/10', icon: TrendingDown, label: 'Lost' },
  claimed: { color: 'bg-accent/5 text-accent border-accent/10', icon: Trophy, label: 'Claimed' },
  refunded: { color: 'bg-secondary/50 text-secondary-foreground border-border', icon: Trophy, label: 'Refunded' },
  void: { color: 'bg-muted/50 text-muted-foreground border-border', icon: Clock, label: 'Void' }
};

export default function BetCard({ bet, index, walletAddress, onRefundRequest }) {
  const queryClient = useQueryClient();
  const [localBetStatus, setLocalBetStatus] = useState(bet.status);
  const [localActualPayout, setLocalActualPayout] = useState(bet.actual_payout);
  const [hasClaimedLocally, setHasClaimedLocally] = useState(false);
  
  // Sync local state when bet prop changes (from query refetch)
  // CRITICAL: Don't override if we've already claimed locally and updated the DB
  React.useEffect(() => {
    // If we claimed locally, only sync if the DB now confirms it's claimed
    if (hasClaimedLocally) {
      if (bet.status === 'claimed' || bet.actual_payout > 0) {
        // DB confirms claim - safe to sync and reset flag
        setLocalBetStatus(bet.status);
        setLocalActualPayout(bet.actual_payout || 0);
        setHasClaimedLocally(false);
      }
      // Otherwise keep local claimed status - don't override with old data
      return;
    }
    
    // Normal sync when not in claimed state
    setLocalBetStatus(bet.status);
    setLocalActualPayout(bet.actual_payout || 0);
  }, [bet.id, bet.status, bet.actual_payout, hasClaimedLocally]);
  const config = statusConfig[localBetStatus] || statusConfig.active;
  const StatusIcon = config.icon;

  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimInstruction, setClaimInstruction] = useState(null);
  const [claimSignature, setClaimSignature] = useState(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawData, setWithdrawData] = useState(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Fetch match data OR futures market data
  const { data: match } = useQuery({
    queryKey: ['match', bet.match_id],
    queryFn: async () => {
      const matches = await base44.entities.Match.filter({ id: bet.match_id });
      return matches[0];
    },
    enabled: !!bet.match_id && !bet._isFutures
  });

  // Fetch futures market - use futures_market_id if available, otherwise match_id
  const futuresMarketId = bet.futures_market_id || bet.match_id;
  const { data: futuresMarket } = useQuery({
    queryKey: ['futures-market', futuresMarketId],
    queryFn: async () => {
      const markets = await base44.entities.FuturesMarket.filter({ id: futuresMarketId });
      return markets[0];
    },
    enabled: !!futuresMarketId && (bet._isFutures || !match)
  });

  // Determine which flag to show based on backed outcome
  const isFutures = !!futuresMarket || !!bet._isFutures;
  const outcomeFlag = isFutures 
    ? (bet.outcome === 'a' ? '🥇' : bet.outcome === 'b' ? '🥈' : '🥉')
    : (bet.outcome === 'a' ? match?.team_a_flag : bet.outcome === 'b' ? match?.team_b_flag : '🤝');
  const outcomeTeam = isFutures
    ? (bet.outcome_label || (bet.outcome === 'a' ? '1st Place' : bet.outcome === 'b' ? '2nd Place' : '3rd Place'))
    : (bet.outcome === 'a' ? match?.team_a : bet.outcome === 'b' ? match?.team_b : 'Draw');

  // Determine opposing team (for futures, show the other positions)
  const opposingFlag = isFutures ? null : (bet.outcome === 'a' ? match?.team_b_flag : bet.outcome === 'b' ? match?.team_a_flag : null);
  const opposingTeam = isFutures
    ? (bet.outcome === 'a' ? '2nd/3rd' : bet.outcome === 'b' ? '1st/3rd' : '1st/2nd')
    : (bet.outcome === 'a' ? match?.team_b : bet.outcome === 'b' ? match?.team_a : null);

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

      // Return solana instruction for signing
      return res.data;
    },
    onSuccess: (data) => {
      // Show transaction signer dialog
      setClaimInstruction(data);
      setClaimDialogOpen(true);
      // DON'T invalidate here - wait until DB confirms claim in handleClaimTransactionSuccess
    },
    onError: (err) => {
      console.error('[BetCard] Claim error:', err);
      console.error('[BetCard] Claim error response:', err.response?.data);
      console.error('[BetCard] Claim error status:', err.response?.status);
      alert('Claim failed: ' + err.message + (err.response?.data?.error ? ' - ' + err.response?.data.error : ''));
    }
  });

  const handleClaimTransactionSuccess = async (txResult) => {
    const signature = txResult.signature;
    setClaimSignature(signature);

    // Mark as claimed locally and set flag to prevent override from query refetch
    setLocalBetStatus('claimed');
    setLocalActualPayout(bet.potential_payout || 0);
    setHasClaimedLocally(true);

    // Call backend to update DB using service role (bypasses RLS)
    const idsToUpdate = bet.betIds || [bet.id];
    try {
      const res = await base44.functions.invoke('finalizeClaim', {
        userBetId: bet.id,
        batchBetIds: idsToUpdate,
        signature
      });
      console.log('[BetCard] ✓ Backend finalized claim:', res.data);
    } catch (err) {
      console.error('[BetCard] Failed to finalize claim:', err);
    }

    // Close the claim dialog after a short delay so user can see success
    setTimeout(() => {
      setClaimDialogOpen(false);
      setClaimInstruction(null);
      setClaimSignature(null);
      // Invalidate cache AFTER local state is already updated
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
    }, 2500);
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
        solanaInstruction: data.solana_instruction
      });
    }
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

  // LP bet: role='lp' with unmatched liquidity - can withdraw
  const isLp = bet.role === 'lp';

  // LPs can claim if: status is 'won' OR (status is 'active' AND market is settled on-chain)
  const canClaim = localBetStatus === 'won' || (isLp && localBetStatus === 'active');
  const canRefund = localBetStatus === 'refunded';
  const isCompleted = ['lost', 'claimed', 'void'].includes(localBetStatus);
  const unmatched = isLp && (bet.status === 'pending' || bet.status === 'active') ? bet.liquidity_unmatched || bet.amount : 0;
  const canWithdraw = isLp && unmatched > 0 && (bet.status === 'pending' || bet.status === 'active');

  // Parimutuel LP bet: role='lp' with no offer_id - displays as pool share, not matching progress
  const isParimutuelLp = bet.role === 'lp' && !bet.offer_id;

  // For parimutuel bets: calculate pool share instead of match progress
  const poolShare = isParimutuelLp ? (calculatePoolShare(bet.amount || 0, bet.total_pool || bet.amount || 1) || 0) : 0;
  const isParimutuelActive = isParimutuelLp && (bet.status === 'pending' || bet.status === 'active');

  // For fixed-odds bets: calculate match progress (how much of the bet is matched)
  const matchProgress = !isParimutuelActive && (bet.status === 'pending' || bet.status === 'active') && bet.amount > 0 ?
  Math.min(100, Math.round((bet.amount - (unmatched || 0)) / bet.amount * 100)) :
  100;
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
            {withdrawData?.solana_instruction &&
            <SolanaTransactionSigner
              instruction={withdrawData.solana_instruction}
              amount={withdrawData.amount?.toFixed(4) || '0'}
              userBetId={bet.id}
              onSuccess={handleWithdrawSuccess}
              onError={() => setWithdrawDialogOpen(false)} />

            }
            <Button
              variant="outline"
              onClick={() => setWithdrawDialogOpen(false)}
              className="w-full h-10 text-sm rounded-xl border-border/50">
              
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
            {claimSignature ?
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
                className="block">
                
                  <Button
                  variant="outline"
                  className="w-full h-11 font-heading font-bold rounded-xl border-primary/30 text-primary hover:bg-primary/10">
                  
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View on Solscan →
                  </Button>
                </a>
                <Button
                variant="secondary"
                onClick={handleCloseClaimDialog}
                className="w-full h-10 text-sm rounded-xl">
                
                  Close
                </Button>
              </div> :

            <>
                <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
                  <p className="text-sm text-muted-foreground">Claim Amount</p>
                  <p className="font-heading font-bold text-2xl text-accent">◎{(bet.potential_payout || 0).toFixed(4)} SOL</p>
                  <p className="text-xs text-muted-foreground mt-2">Sign transaction to claim</p>
                </div>
                {claimInstruction?.solana_instruction &&
              <SolanaTransactionSigner
                instruction={claimInstruction.solana_instruction}
                amount={(bet.potential_payout || 0).toFixed(4)}
                userBetId={bet.id}
                onSuccess={handleClaimTransactionSuccess}
                onError={() => setClaimDialogOpen(false)} />

              }
                <Button
                variant="outline"
                onClick={handleCloseClaimDialog}
                className="w-full h-10 text-sm rounded-xl border-border/50">
                
                  Cancel
                </Button>
              </>
            }
          </div>
        </DialogContent>
      </Dialog>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="h-full">
        
        <Card className="bg-[#1c1c1c] border border-primary/20 rounded-2xl overflow-hidden h-full flex flex-col">
          <CardContent className="p-4 flex-1 flex flex-col">
            <div className="space-y-3 flex-1 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between">
               <span className="text-[9px] text-muted-foreground font-semibold truncate">
                 {bet.match_title || 'Match'}
               </span>
               <div className="flex items-center gap-1.5">
                 {/* Share button: Only show for LP holders BEFORE bets close */}
                 {isLp && (match?.status === 'upcoming' || match?.status === 'live') && (
                   <Button
                     size="icon"
                     variant="outline"
                     onClick={() => setShareDialogOpen(true)}
                     className="h-7 w-7 rounded-lg border-primary/30 hover:bg-primary/20 text-primary hover:text-primary transition-all bg-primary/5"
                     title="Share link to match your bet"
                   >
                     <Share2 className="w-4 h-4" />
                   </Button>
                 )}
                 <Badge className={`text-[8px] font-semibold uppercase tracking-wider flex-shrink-0 ${statusConfig[localBetStatus]?.color || statusConfig.active.color}`}>
                   {statusConfig[localBetStatus]?.label || 'Active'}
                 </Badge>
               </div>
              </div>

              {/* Outcome - VS Style for matches, Position badge for futures */}
              {isFutures ? (
                /* Futures betting display */
                <div className="flex items-center justify-center gap-2">
                  <div className="flex-1 text-center">
                    <div className="text-3xl mb-0.5">{outcomeFlag || '🏆'}</div>
                    <p className="text-[9px] font-bold text-primary truncate">{outcomeTeam || bet.outcome_label}</p>
                    <p className="text-[8px] text-muted-foreground mt-0.5">{futuresMarket?.country || 'Futures'}</p>
                  </div>
                </div>
              ) : (
                /* Match betting display */
                <div className="flex items-center justify-between gap-1">
                  {/* Your Team */}
                  <div className="flex-1 text-center">
                    <div className="text-2xl mb-0.5">{outcomeFlag || '🏆'}</div>
                    <p className="text-[9px] font-bold text-primary truncate">{outcomeTeam || bet.outcome_label}</p>
                  </div>

                  {/* VS Badge */}
                  <div className="flex flex-col items-center px-1 flex-shrink-0">
                    <span className="text-[7px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">VS</span>
                  </div>

                  {/* Opposing Team */}
                  {opposingFlag &&
                  <div className="flex-1 text-center">
                      <div className="text-2xl mb-0.5">{opposingFlag}</div>
                      <p className="text-[9px] font-medium text-muted-foreground truncate">{opposingTeam}</p>
                    </div>
                  }
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-lg px-2 py-2 text-center border ${localBetStatus === 'won' || localBetStatus === 'claimed' ? 'bg-accent/5 border-accent/10' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-[9px] text-muted-foreground truncate">{bet.betCount && bet.betCount > 1 ? 'Total Stake' : 'Stake'}</p>
                  <p className="font-bold text-foreground text-xs">◎{(bet.totalAmount || bet.amount)?.toFixed(4)}</p>
                </div>
                <div className={`rounded-lg px-2 py-2 text-center border ${localBetStatus === 'won' || localBetStatus === 'claimed' ? 'bg-accent/5 border-accent/10' : 'bg-primary/5 border-primary/10'}`}>
                  <p className="text-[9px] text-muted-foreground truncate">Potential</p>
                  <p className="font-bold text-primary text-xs">◎{(bet.totalPayout || bet.potential_payout || 0).toFixed(4)}</p>
                </div>
                <div className="rounded-lg px-2 py-2 text-center border border-border/30 bg-[#272525]">
                  <p className="text-[9px] text-muted-foreground truncate">{bet.betCount && bet.betCount > 1 ? 'Bets' : 'Role'}</p>
                  <p className="font-bold text-accent text-xs capitalize">{bet.betCount && bet.betCount > 1 ? `${bet.betCount}` : bet.role === 'lp' ? 'LP' : 'Bettor'}</p>
                </div>
              </div>

              {/* Pool Share / Progress */}
              {isParimutuelActive &&
              <div className="pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between text-[8px] text-muted-foreground mb-1">
                    <span>Pool Share</span>
                    <span className="font-bold text-accent">{poolShare.toFixed(2)}%</span>
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${poolShare}%` }} />
                  </div>
                </div>
              }

              {!isParimutuelActive && (localBetStatus === 'pending' || localBetStatus === 'active') &&
              <div className="pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between text-[8px] text-muted-foreground mb-1">
                    <span>{isFullyMatched ? 'Fully Matched' : 'Matching'}</span>
                    <span className="font-bold text-primary">{matchProgress}%</span>
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${matchProgress}%` }} />
                  </div>
                </div>
              }

              {/* Action Button */}
              <div className="pt-2 border-t border-border/30 mt-auto">
                {canWithdraw &&
                <Button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending || withdrawDialogOpen}
                  className="w-full h-8 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 font-bold rounded-lg border border-yellow-500/20 text-xs">
                  
                    {withdrawMutation.isPending ?
                  <div className="w-3.5 h-3.5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" /> :

                  <>
                        <Wallet className="w-3.5 h-3.5 mr-1.5" />
                        Withdraw ◎{unmatched.toFixed(2)}
                      </>
                  }
                  </Button>
                }
                {canClaim &&
                <Button
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending || claimDialogOpen}
                  className="w-full h-8 bg-accent/10 hover:bg-accent/20 text-accent font-bold rounded-lg border border-accent/20 text-xs">
                  
                    {claimMutation.isPending ?
                  <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /> :

                  <>
                        <Trophy className="w-3.5 h-3.5 mr-1.5" />
                        Claim ◎{(bet.potential_payout || 0).toFixed(2)}
                      </>
                  }
                  </Button>
                }
                {canRefund &&
                <Button
                  onClick={() => claimRefundMutation.mutate()}
                  disabled={claimRefundMutation.isPending}
                  className="w-full h-8 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 font-bold rounded-lg border border-yellow-500/20 text-xs">
                  
                    {claimRefundMutation.isPending ?
                  <div className="w-3.5 h-3.5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" /> :

                  <>
                        <Wallet className="w-3.5 h-3.5 mr-1.5" />
                        Claim Refund
                      </>
                  }
                  </Button>
                }
                {isCompleted &&
                <div className="text-center text-[9px] text-muted-foreground">
                    {localBetStatus === 'claimed' &&
                  <span className="text-accent font-bold">◎{(localActualPayout || bet.potential_payout || 0).toFixed(2)} claimed</span>
                  }
                    {localBetStatus === 'lost' && <span className="text-destructive">Bet lost</span>}
                    {localBetStatus === 'void' && <span>Bet voided</span>}
                  </div>
                }
                
                {/* Share winnings button: Show for claimed/won bets */}
                {(localBetStatus === 'claimed' || localBetStatus === 'won') && (
                  <Button
                    onClick={() => {
                      const winAmount = (localActualPayout || bet.potential_payout || 0).toFixed(4);
                      const stake = (bet.totalAmount || bet.amount || 0).toFixed(4);
                      const profit = ((localActualPayout || bet.potential_payout || 0) - (bet.totalAmount || bet.amount || 0)).toFixed(4);
                      const profitPercent = (((localActualPayout || bet.potential_payout || 0) / (bet.totalAmount || bet.amount || 1) - 1) * 100).toFixed(1);
                      const teamName = isFutures ? (bet.outcome_label || 'My Pick') : (bet.outcome === 'a' ? match?.team_a : bet.outcome === 'b' ? match?.team_b : 'Draw');
                      const teamFlag = isFutures ? '🏆' : (bet.outcome === 'a' ? match?.team_a_flag : bet.outcome === 'b' ? match?.team_b_flag : '🤝');
                      
                      const tweetText = `🎉 Just won ◎${winAmount} SOL on @ElevenX_Bet! 
                      
 backed ${teamFlag} ${teamName} with ◎${stake}
 💰 Profit: ◎${profit} (+${profitPercent}%)
 
 Join the action ⬇️
 https://elevenx.bet`;
                      
                      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
                      window.open(twitterUrl, '_blank');
                    }}
                    className="w-full h-8 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] font-bold rounded-lg border border-[#1DA1F2]/20 text-xs mt-2"
                  >
                    🐦 Share Winnings on X
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Share Bet Modal */}
      <ShareBetModal
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        bet={bet}
        match={match}
        futuresMarket={futuresMarket}
      />
    </>);

}