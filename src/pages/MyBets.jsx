import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, DollarSign, Target, Flame, Shield, BarChart3, Activity, Award, TrendingUp, Clock, Wallet, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import StatCard from '@/components/dashboard/StatCard';
import QuickStat from '@/components/dashboard/QuickStat';
import EmptyState from '@/components/dashboard/EmptyState';
import BetCard from '@/components/dashboard/BetCard';

const statusConfig = {
  active:   { color: 'bg-primary/10 text-primary border-primary/20', icon: Clock, label: 'Active' },
  pending:  { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock, label: 'Pending' },
  won:      { color: 'bg-accent/20 text-accent border-accent/20', icon: TrendingUp, label: 'Won' },
  lost:     { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: TrendingUp, label: 'Lost' },
  claimed:  { color: 'bg-accent/20 text-accent border-accent/20', icon: Trophy, label: 'Claimed' },
  refunded: { color: 'bg-secondary text-secondary-foreground border-border', icon: Shield, label: 'Refunded' },
  void:     { color: 'bg-muted text-muted-foreground border-border', icon: Clock, label: 'Void' },
};

const RefundDialog = ({ open, onClose, data, onSignSuccess }) => {
  const [signature, setSignature] = useState(null);
  
  const handleSignSuccess = (result) => {
    setSignature(result.signature);
    onSignSuccess();
  };
  
  if (!data) return null;
  
  if (signature) {
    const solanaScanUrl = `https://solscan.io/tx/${signature}?cluster=devnet`;
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              Refund Claimed!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Refund Claimed!</p>
              <p className="font-heading font-bold text-3xl text-accent">◎{data?.refundAmount.toFixed(4)} SOL</p>
              <p className="text-xs text-muted-foreground mt-2">Successfully transferred to your wallet</p>
            </div>
            
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">Transaction Details</p>
              <a 
                href={solanaScanUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-2 text-primary text-xs font-bold hover:underline"
              >
                View on Solscan
              </a>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{signature.slice(0, 20)}...{signature.slice(-16)}</p>
            </div>
            
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full h-10 text-sm rounded-xl border-border/50"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Claim Refund</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">Refund Amount</p>
            <p className="font-heading font-bold text-2xl text-yellow-400">◎{data?.refundAmount.toFixed(4)} SOL</p>
            <p className="text-xs text-muted-foreground mt-2">Unmatched liquidity will be returned to your wallet</p>
          </div>
          
          <SolanaTransactionSigner
            instruction={data.solanaInstruction}
            amount={data.refundAmount}
            userBetId={data.userBetId}
            onSuccess={handleSignSuccess}
            onError={() => onClose()}
          />
          
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full h-10 text-sm rounded-xl border-border/50"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function MyBets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refundDialog, setRefundDialog] = useState(null);
  const [claimData, setClaimData] = useState(null);
  const [batchClaimMatchId, setBatchClaimMatchId] = useState(null);
  const [pendingWithdrawTx, setPendingWithdrawTx] = useState(null);

  const getWalletAddress = () => {
    const walletSession = localStorage.getItem('elevenx_wallet_session');
    if (walletSession) {
      try {
        const parsed = JSON.parse(walletSession);
        return parsed.address || parsed;
      } catch { return walletSession; }
    }
    return null;
  };
  const walletAddress = getWalletAddress();

  const { data: myBets = [], isLoading, refetch } = useQuery({
    queryKey: ['myBets', walletAddress, user?.id],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 100);
      if (walletAddress) return all.filter(ub => ub.wallet_address === walletAddress);
      if (user?.id) return all.filter(ub => ub.created_by_id === user.id);
      return [];
    },
    enabled: !!walletAddress || !!user,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // LP offers for the LP tab
  const { data: allOffers = [] } = useQuery({
    queryKey: ['allOffers'],
    queryFn: () => base44.entities.BetOffer.list('-created_date', 100),
  });
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list(),
  });
  const lpOffers = allOffers.filter(o => o.lp_wallet_address === walletAddress);
  const activeLpOffers = lpOffers.filter(o => o.status === 'open' || o.status === 'partially_matched');
  const settledLpOffers = lpOffers.filter(o => ['fully_matched', 'settled', 'cancelled'].includes(o.status));
  
  const getMatchTitle = (matchId) => {
    const m = matches.find(m => m.id === matchId);
    return m ? `${m.team_a} vs ${m.team_b}` : 'Unknown';
  };
  
  const getOutcomeLabel = (offer) => {
    if (offer.outcome === 'a') return offer.outcome_label || 'Team A';
    if (offer.outcome === 'b') return offer.outcome_label || 'Team B';
    return 'Draw';
  };

  const totalStaked = myBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = myBets.filter(b => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.actual_payout || 0), 0);
  const activeBets = myBets.filter(b => b.status === 'active' || b.status === 'pending');
  const completedBets = myBets.filter(b => b.status !== 'active' && b.status !== 'pending');
  const pendingClaims = myBets.filter(b => b.status === 'won');
  const availableRefunds = myBets.filter(b => b.status === 'refunded');
  
  // Group won bets by match for batch claiming
  const groupedWonBets = pendingClaims.reduce((acc, bet) => {
    if (!acc[bet.match_id]) {
      acc[bet.match_id] = [];
    }
    acc[bet.match_id].push(bet);
    return acc;
  }, {});
  
  const potentialWinnings = activeBets.reduce((s, b) => s + (b.potential_payout || 0), 0);
  const winRate = myBets.length > 0 ? ((myBets.filter(b => b.status === 'won' || b.status === 'claimed').length / myBets.length) * 100).toFixed(1) : 0;

  const handleRefundSuccess = () => {
    setRefundDialog(null);
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
  };

  const withdrawLpMutation = useMutation({
    mutationFn: async (offer) => {
      const res = await base44.functions.invoke('withdrawLiquidity', {
        walletAddress,
        userBetId: offer.userBetId,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setPendingWithdrawTx({
        instruction: data.solana_instruction,
        amount: data.amount,
        userBetId: data.userBetId,
        offerId: data.offerId,
      });
    },
    onError: (err) => {
      console.error('[MyBets] Withdraw error:', err);
    },
  });

  const handleWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    if (pendingWithdrawTx?.userBetId && pendingWithdrawTx?.offerId) {
      try {
        const commitRes = await base44.functions.invoke('finalizeWithdrawal', {
          signature,
          userBetId: pendingWithdrawTx.userBetId,
          offerId: pendingWithdrawTx.offerId,
        });
        if (commitRes.data.error) {
          console.error('[MyBets] finalizeWithdrawal error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[MyBets] finalizeWithdrawal threw:', err);
      }
    }
    setPendingWithdrawTx(null);
    queryClient.invalidateQueries({ queryKey: ['lpOffers', walletAddress] });
  };

  const handleWithdrawError = (err) => {
    console.error('[MyBets] Withdraw tx error:', err);
    setPendingWithdrawTx(null);
  };

  const handleBatchClaim = async (matchId, bets) => {
    try {
      console.log('[MyBets] Batch claim:', { matchId, betCount: bets.length, wallet: walletAddress });
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
      }
      const betIds = bets.map(b => b.id);
      const res = await base44.functions.invoke('claimWinnings', { 
        userBetId: betIds[0], 
        batchBetIds: betIds,
        walletAddress: walletAddress 
      });
      console.log('[MyBets] Claim response:', res.data);
      if (res.data.error) {
        throw new Error(res.data.error + (res.data.debug ? ' - ' + JSON.stringify(res.data.debug) : ''));
      }
      // DB-only claim (voided market) — already committed server-side
      if (res.data.db_only) {
        alert(res.data.message || '✓ Winnings claimed!');
        queryClient.invalidateQueries({ queryKey: ['myBets'] });
        return;
      }
      setClaimData({ ...res.data, matchId });
      setBatchClaimMatchId(matchId);
    } catch (err) {
      console.error('[MyBets] Claim error:', err);
      alert('Claim failed: ' + err.message);
    }
  };

  const handleClaimSignSuccess = async () => {
    if (claimData?.betIds) {
      for (const betId of claimData.betIds) {
        await base44.entities.UserBet.update(betId, { status: 'claimed' });
      }
    }
    setClaimData(null);
    setBatchClaimMatchId(null);
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <RefundDialog
        open={!!refundDialog}
        data={refundDialog}
        onClose={() => setRefundDialog(null)}
        onSignSuccess={handleRefundSuccess}
      />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-black text-3xl mb-1">My Bets Dashboard</h1>
          <p className="text-sm text-muted-foreground">Track your World Cup betting performance</p>
        </div>
        <Link to="/matches">
          <Button variant="outline" className="gap-2 rounded-xl">
            <Activity className="w-4 h-4" />
            Browse Matches
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="Total Staked" 
          value={`◎${totalStaked.toFixed(4)}`} 
          icon={DollarSign}
          color="text-foreground"
          delay={0}
        />
        <StatCard 
          label="Potential Winnings" 
          value={`◎${potentialWinnings.toFixed(4)}`} 
          icon={TrendingUp}
          color="text-primary"
          delay={0.05}
        />
        <StatCard 
          label="Total Won" 
          value={`◎${totalWon.toFixed(4)}`} 
          icon={Award}
          color="text-accent"
          delay={0.1}
        />
        <StatCard 
          label="Win Rate" 
          value={`${winRate}%`} 
          icon={Target}
          color="text-accent"
          delay={0.15}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <QuickStat 
          label="Active Bets" 
          value={activeBets.length}
          icon={Flame}
          color="bg-primary/10 text-primary"
        />
        <QuickStat 
          label="Pending Claims" 
          value={pendingClaims.length}
          icon={Trophy}
          color="bg-accent/10 text-accent"
        />
        <QuickStat 
          label="Available Refunds" 
          value={availableRefunds.length}
          icon={Shield}
          color="bg-yellow-500/10 text-yellow-400"
        />
        <QuickStat 
          label="LP Positions" 
          value={activeLpOffers.length}
          icon={TrendingUp}
          color="bg-primary/10 text-primary"
        />
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-card border border-border/50 rounded-xl">
          <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg">
            <Clock className="w-4 h-4 mr-2" />
            Active ({activeBets.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-lg">
            <Trophy className="w-4 h-4 mr-2" />
            Pending Claims ({pendingClaims.length})
          </TabsTrigger>
          <TabsTrigger value="lp" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg">
            <TrendingUp className="w-4 h-4 mr-2" />
            LP ({activeLpOffers.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground rounded-lg">
            <BarChart3 className="w-4 h-4 mr-2" />
            History ({completedBets.filter(b => b.status !== 'won').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeBets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeBets.map((bet, i) => (
                <BetCard 
                  key={bet.id} 
                  bet={bet} 
                  index={i} 
                  walletAddress={walletAddress} 
                  onRefundRequest={(data) => setRefundDialog(data)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No active bets" actionText="Browse Matches" link="/matches" />
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {pendingClaims.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(groupedWonBets).map(([matchId, bets]) => {
                const totalPayout = bets.reduce((sum, b) => sum + (b.potential_payout || 0), 0);
                const isClaiming = batchClaimMatchId === matchId;
                
                return (
                  <div key={matchId} className="bg-card border border-border/50 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-heading font-bold text-sm">{bets[0].match_title || 'Match'}</h3>
                        <p className="text-xs text-muted-foreground">{bets.length} bet(s) to claim</p>
                      </div>
                      <div className="text-right">
                        <p className="font-heading font-bold text-accent">◎{totalPayout.toFixed(4)}</p>
                        <p className="text-[10px] text-muted-foreground">Total payout</p>
                      </div>
                    </div>
                    
                    {claimData?.matchId === matchId ? (
                      <SolanaTransactionSigner
                        instruction={claimData.solana_instruction}
                        amount={totalPayout.toFixed(4)}
                        userBetId={claimData.betIds[0]}
                        batchBetIds={claimData.betIds}
                        onSuccess={handleClaimSignSuccess}
                        onError={() => setClaimData(null)}
                      />
                    ) : (
                      <Button
                        onClick={() => handleBatchClaim(matchId, bets)}
                        className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-xl text-sm"
                      >
                        <Wallet className="w-4 h-4 mr-2" />
                        Claim All ({bets.length} bets)
                      </Button>
                    )}
                    
                    <div className="mt-4 space-y-2">
                      {bets.map(bet => (
                        <div key={bet.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded-lg p-2">
                          <span className="text-muted-foreground">{bet.outcome_label}</span>
                          <span className="font-bold">◎{bet.amount?.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No pending claims" />
          )}
        </TabsContent>

        <TabsContent value="lp" className="space-y-4">
          {activeLpOffers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeLpOffers.map((offer, i) => {
                const userBet = allOffers.find(o => o.id === offer.id);
                const matchPct = offer.amount_offered > 0
                  ? Math.round((offer.amount_matched / offer.amount_offered) * 100)
                  : 0;
                const hasUnmatched = (offer.amount_unmatched || 0) > 0;
                const userBetForOffer = lpOffers.find(ub => ub.offer_id === offer.id);
                
                return (
                  <motion.div key={offer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="bg-card border border-border/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-heading font-bold text-sm">{getOutcomeLabel(offer)}</p>
                        <p className="text-[10px] text-muted-foreground">{getMatchTitle(offer.match_id)}</p>
                      </div>
                      <Badge className={`text-[10px] ${
                        offer.status === 'fully_matched' ? 'bg-accent/20 text-accent' :
                        offer.status === 'partially_matched' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-secondary text-secondary-foreground'
                      }`}>{offer.status}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs mt-2">
                      <div>
                        <p className="text-muted-foreground">Committed</p>
                        <p className="font-bold">◎{(offer.amount_offered || 0).toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Matched</p>
                        <p className="font-bold text-accent">◎{(offer.amount_matched || 0).toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Unmatched</p>
                        <p className="font-bold text-yellow-400">◎{(offer.amount_unmatched || 0).toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Match rate</span><span>{matchPct}%</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${matchPct}%` }} />
                      </div>
                    </div>
                    
                    {hasUnmatched && (
                      <div className="mt-3">
                        {pendingWithdrawTx?.userBetId === userBetForOffer?.id && pendingWithdrawTx?.instruction ? (
                          <SolanaTransactionSigner
                            instruction={pendingWithdrawTx.instruction}
                            amount={pendingWithdrawTx.amount}
                            onSuccess={handleWithdrawSuccess}
                            onError={handleWithdrawError}
                          />
                        ) : (
                          <Button
                            onClick={() => withdrawLpMutation.mutate({ ...offer, userBetId: userBetForOffer?.id })}
                            disabled={withdrawLpMutation.isPending}
                            variant="outline"
                            className="w-full h-8 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 rounded-lg"
                          >
                            {withdrawLpMutation.isPending ? (
                              <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                            ) : (
                              <>Withdraw ◎{(offer.amount_unmatched || 0).toFixed(4)}</>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                    
                    <Link to={`/match/${offer.match_id}`}>
                      <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs border-border/50 rounded-lg">
                        View Market <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No LP positions" actionText="Go to LP Dashboard" link="/lp" />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {completedBets.filter(b => b.status !== 'won').length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {completedBets.filter(b => b.status !== 'won').map((bet, i) => (
                <BetCard 
                  key={bet.id} 
                  bet={bet} 
                  index={i} 
                  walletAddress={walletAddress} 
                  onRefundRequest={(data) => setRefundDialog(data)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No betting history" />
          )}
        </TabsContent>
      </Tabs>

      {myBets.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <Trophy className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-lg mb-2">No bets yet</p>
          <p className="text-muted-foreground text-sm mb-4">Start betting on World Cup matches!</p>
          <Link to="/matches">
            <Button className="gap-2 rounded-xl">
              <Activity className="w-4 h-4" />
              Browse Matches
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}