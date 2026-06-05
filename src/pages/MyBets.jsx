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
import LpPositionCard from '@/components/lp/LpPositionCard';

const statusConfig = {
  active: { color: 'bg-primary/10 text-primary border-primary/20', icon: Clock, label: 'Active' },
  pending: { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock, label: 'Pending' },
  won: { color: 'bg-accent/20 text-accent border-accent/20', icon: TrendingUp, label: 'Won' },
  lost: { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: TrendingUp, label: 'Lost' },
  claimed: { color: 'bg-accent/20 text-accent border-accent/20', icon: Trophy, label: 'Claimed' },
  refunded: { color: 'bg-secondary text-secondary-foreground border-border', icon: Shield, label: 'Refunded' },
  void: { color: 'bg-muted text-muted-foreground border-border', icon: Clock, label: 'Void' }
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
                className="inline-flex items-center gap-2 text-primary text-xs font-bold hover:underline">
                
                View on Solscan
              </a>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{signature.slice(0, 20)}...{signature.slice(-16)}</p>
            </div>
            
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full h-10 text-sm rounded-xl border-border/50">
              
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>);

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
            onError={() => onClose()} />
          
          
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full h-10 text-sm rounded-xl border-border/50">
            
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>);

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
      } catch {return walletSession;}
    }
    return null;
  };
  const walletAddress = getWalletAddress();

  const { data: myBets = [], isLoading, refetch } = useQuery({
    queryKey: ['myBets', walletAddress, user?.id],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 100);
      if (walletAddress) return all.filter((ub) => ub.wallet_address === walletAddress);
      if (user?.id) return all.filter((ub) => ub.created_by_id === user.id);
      return [];
    },
    enabled: !!walletAddress || !!user,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });

  // LP offers for the LP tab
  const { data: allOffers = [] } = useQuery({
    queryKey: ['allOffers'],
    queryFn: () => base44.entities.BetOffer.list('-created_date', 100)
  });
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list()
  });
  const lpOffers = allOffers.filter((o) => o.lp_wallet_address === walletAddress);
  const activeLpOffers = lpOffers.filter((o) => o.status === 'open' || o.status === 'partially_matched');
  const settledLpOffers = lpOffers.filter((o) => ['fully_matched', 'settled', 'cancelled'].includes(o.status));

  const getMatchTitle = (matchId) => {
    const m = matches.find((m) => m.id === matchId);
    return m ? `${m.team_a} vs ${m.team_b}` : 'Unknown';
  };

  const getOutcomeLabel = (offer) => {
    if (offer.outcome === 'a') return offer.outcome_label || 'Team A';
    if (offer.outcome === 'b') return offer.outcome_label || 'Team B';
    return 'Draw';
  };

  // LP positions: role='lp' WITH offer_id (traditional LP only, not parimutuel)
  const myLpPositions = myBets.filter((b) => {
    return b.role === 'lp' && b.offer_id !== null && !b._isParimutuel;
  });
  
  // Matcher bets: role='matcher' OR parimutuel LP bets (role='lp' with _isParimutuel=true)
  const myMatcherBets = myBets.filter((b) => {
    return b.role === 'matcher' || (b.role === 'lp' && b._isParimutuel);
  });
  
  // DEBUG: Log filtering results
  console.log('[MyBets] Total bets:', myBets.length);
  console.log('[MyBets] myLpPositions (all LP with offer_id):', myLpPositions.length, myLpPositions.map(b => ({ id: b.id.slice(0,8), role: b.role, offer_id: b.offer_id, _isParimutuel: b._isParimutuel })));
  console.log('[MyBets] myMatcherBets (matcher only):', myMatcherBets.length, myMatcherBets.map(b => ({ id: b.id.slice(0,8), role: b.role, offer_id: b.offer_id })));
  
  const totalStaked = myMatcherBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = myMatcherBets.filter((b) => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.actual_payout || 0), 0);
  const activeBets = myMatcherBets.filter((b) => b.status === 'active' || b.status === 'pending');
  const completedBets = myMatcherBets.filter((b) => b.status !== 'active' && b.status !== 'pending');
  const pendingClaims = myMatcherBets.filter((b) => b.status === 'won');
  const availableRefunds = myMatcherBets.filter((b) => b.status === 'refunded');

  // Group won bets by match for batch claiming
  const groupedWonBets = pendingClaims.reduce((acc, bet) => {
    if (!acc[bet.match_id]) {
      acc[bet.match_id] = [];
    }
    acc[bet.match_id].push(bet);
    return acc;
  }, {});

  const potentialWinnings = activeBets.reduce((s, b) => s + (b.potential_payout || 0), 0);
  const winRate = myBets.length > 0 ? (myBets.filter((b) => b.status === 'won' || b.status === 'claimed').length / myBets.length * 100).toFixed(1) : 0;

  const handleRefundSuccess = () => {
    setRefundDialog(null);
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
  };

  const withdrawLpMutation = useMutation({
    mutationFn: async (offer) => {
      const res = await base44.functions.invoke('withdrawLiquidity', {
        walletAddress,
        userBetId: offer.userBetId
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setPendingWithdrawTx({
        instruction: data.solana_instruction,
        amount: data.amount,
        userBetId: data.userBetId,
        offerId: data.offerId
      });
    },
    onError: (err) => {
      console.error('[MyBets] Withdraw error:', err);
    }
  });

  const handleWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    if (pendingWithdrawTx?.userBetId && pendingWithdrawTx?.offerId) {
      try {
        const commitRes = await base44.functions.invoke('finalizeWithdrawal', {
          signature,
          userBetId: pendingWithdrawTx.userBetId,
          offerId: pendingWithdrawTx.offerId
        });
        if (commitRes.data.error) {
          console.error('[MyBets] finalizeWithdrawal error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[MyBets] finalizeWithdrawal threw:', err);
      }
    }
    setPendingWithdrawTx(null);
    // Invalidate both lpOffers AND myBets to refresh totals and remove withdrawn bets
    queryClient.invalidateQueries({ queryKey: ['lpOffers', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
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
      const betIds = bets.map((b) => b.id);
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
    // Force reload after a short delay to ensure DB is updated
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
    }, 500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <RefundDialog
        open={!!refundDialog}
        data={refundDialog}
        onClose={() => setRefundDialog(null)}
        onSignSuccess={handleRefundSuccess} />
      
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl mb-1">My Bets Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Track your World Cup betting performance</p>
        </div>
        <Link to="/matches">
          <Button variant="outline" className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm">
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Browse Matches</span>
            <span className="sm:hidden">Matches</span>
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          label="Total Bet"
          value={`◎${totalStaked.toFixed(4)}`}
          icon={DollarSign}
          color="text-foreground"
          delay={0} />
        
        <StatCard
          label="Potential Winnings"
          value={`◎${potentialWinnings.toFixed(4)}`}
          icon={TrendingUp}
          color="text-primary"
          delay={0.05} />
        
        <StatCard
          label="Total Won"
          value={`◎${totalWon.toFixed(4)}`}
          icon={Award}
          color="text-accent"
          delay={0.1} />
        
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          icon={Target}
          color="text-accent"
          delay={0.15} />
        
      </div>
      
      {/* LP Stats - includes both traditional and parimutuel LP */}
      {myLpPositions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          <QuickStat
            label="Liquidity Provided"
            value={`◎${myLpPositions.reduce((s, lp) => s + (lp.liquidity_deposited || lp.amount || 0), 0).toFixed(4)}`}
            icon={TrendingUp}
            color="bg-primary/10 text-primary" />
          
          <QuickStat
            label="LP Positions"
            value={myLpPositions.length}
            icon={DollarSign}
            color="bg-primary/10 text-primary" />
          
          <QuickStat
            label="Unmatched Liquidity"
            value={`◎${myLpPositions.reduce((s, lp) => s + (lp.liquidity_unmatched || 0), 0).toFixed(4)}`}
            icon={Wallet}
            color="bg-yellow-500/10 text-yellow-400" />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <QuickStat
          label="Active Bets"
          value={activeBets.length}
          icon={Flame}
          color="bg-primary/10 text-primary" />
        
        <QuickStat
          label="Pending Claims"
          value={pendingClaims.length}
          icon={Trophy}
          color="bg-accent/10 text-accent" />
        
        <QuickStat
          label="Available Refunds"
          value={availableRefunds.length}
          icon={Shield}
          color="bg-yellow-500/10 text-yellow-400" />
        
      </div>

      <Tabs defaultValue="bets" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 bg-card border border-border/50 rounded-xl">
          <TabsTrigger value="bets" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-lg text-xs sm:text-sm">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">My Bets ({myMatcherBets.length})</span>
            <span className="sm:hidden">Bets ({myMatcherBets.length})</span>
          </TabsTrigger>
          <TabsTrigger value="liquidity" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs sm:text-sm">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Liquidity ({myLpPositions.length})</span>
            <span className="sm:hidden">LP ({myLpPositions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground rounded-lg text-xs sm:text-sm">
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">History ({completedBets.length})</span>
            <span className="sm:hidden">History</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bets">
          {myMatcherBets.filter(b => b.status === 'active' || b.status === 'pending' || b.status === 'won').length > 0 ?
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {myMatcherBets.filter(b => b.status === 'active' || b.status === 'pending' || b.status === 'won').map((bet, i) =>
            <BetCard
              key={bet.id}
              bet={bet}
              index={i}
              walletAddress={walletAddress}
              onRefundRequest={(data) => setRefundDialog(data)} />

            )}
            </div> :

          <EmptyState message="No active bets" actionText="Browse Matches" link="/matches" />
          }
        </TabsContent>

        <TabsContent value="liquidity">
          {myLpPositions.length > 0 ?
          <div className="space-y-4">
            {/* Unmatched Liquidity Summary */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-heading font-bold text-sm text-yellow-400">Available to Withdraw</h3>
                </div>
                <p className="font-heading font-bold text-xl text-yellow-400">
                  ◎{myLpPositions.reduce((s, lp) => s + (lp.liquidity_unmatched || 0), 0).toFixed(4)} SOL
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Unmatched funds can be withdrawn anytime — no lock-up period
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {myLpPositions.map((lp, i) => {
                // Find match data for this position
                const lpMatch = matches.find(m => m.id === lp.match_id);
                return (
                  <LpPositionCard
                    key={lp.id}
                    position={lp}
                    match={lpMatch}
                    index={i}
                    walletAddress={walletAddress}
                    onWithdrawRequest={(data) => {
                      // Handle LP withdraw dialog
                      setPendingWithdrawTx({
                        instruction: data.solanaInstruction,
                        amount: data.withdrawAmount,
                        userBetId: data.positionId,
                        offerId: data.offerId
                      });
                    }}
                  />
                );
              })}
            </div>
          </div> :

          <EmptyState message="No liquidity positions" actionText="Provide Liquidity" link="/matches" />
          }
        </TabsContent>

        <TabsContent value="history">
          {myMatcherBets.filter(b => ['lost', 'claimed', 'refunded', 'void'].includes(b.status)).length > 0 ?
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {myMatcherBets.filter(b => ['lost', 'claimed', 'refunded', 'void'].includes(b.status)).map((bet, i) =>
            <BetCard
              key={bet.id}
              bet={bet}
              index={i}
              walletAddress={walletAddress}
              onRefundRequest={(data) => setRefundDialog(data)} />

            )}
            </div> :

          <EmptyState message="No betting history" />
          }
        </TabsContent>
      </Tabs>

      {/* LP Withdraw Dialog */}
      {pendingWithdrawTx && (
        <Dialog open={!!pendingWithdrawTx} onOpenChange={() => setPendingWithdrawTx(null)}>
          <DialogContent className="bg-card border-border/50 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">Withdraw Unmatched Liquidity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                <p className="text-sm text-muted-foreground">Withdraw Amount</p>
                <p className="font-heading font-bold text-2xl text-yellow-400">◎{pendingWithdrawTx.amount?.toFixed(4)} SOL</p>
                <p className="text-xs text-muted-foreground mt-2">Unmatched liquidity returned to your wallet</p>
              </div>
              
              <SolanaTransactionSigner
                instruction={pendingWithdrawTx.instruction}
                amount={pendingWithdrawTx.amount?.toFixed(4) || '0'}
                userBetId={pendingWithdrawTx.userBetId}
                offerId={pendingWithdrawTx.offerId}
                onSuccess={handleWithdrawSuccess}
                onError={handleWithdrawError} />
              
              <Button
                variant="outline"
                onClick={() => setPendingWithdrawTx(null)}
                className="w-full h-10 text-sm rounded-xl border-border/50">
                
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {myBets.length === 0 && !isLoading &&
      <div className="text-center py-16 sm:py-20">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-base sm:text-lg mb-2">No bets yet</p>
          <p className="text-muted-foreground text-xs sm:text-sm mb-4">Start betting on World Cup matches!</p>
          <Link to="/matches">
            <Button className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Browse Matches</span>
              <span className="sm:hidden">Matches</span>
            </Button>
          </Link>
        </div>
      }
    </div>);

}