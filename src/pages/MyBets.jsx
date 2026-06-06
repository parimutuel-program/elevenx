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
import { getWalletFromAuth } from '@/utils/auth';

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

  // Get wallet from auth token (permanent source of truth - not localStorage)
  const walletAddress = getWalletFromAuth();

  const { data: myBets = [], isLoading, refetch } = useQuery({
    queryKey: ['myBets', walletAddress, user?.id],
    queryFn: async () => {
      console.log('[MyBets] Query executing, wallet from auth:', walletAddress);
      console.log('[MyBets] Wallet length:', walletAddress?.length);
      console.log('[MyBets] Wallet trimmed:', walletAddress?.trim());
      const all = await base44.entities.UserBet.list('-created_date', 100);
      console.log('[MyBets] Total bets in DB:', all.length);
      console.log('[MyBets] All bets:', all.map(b => ({ id: b.id, wallet: b.wallet_address, amount: b.amount, status: b.status })));
      const filtered = walletAddress ? all.filter((ub) => {
        const match = ub.wallet_address === walletAddress;
        const trimmedMatch = ub.wallet_address?.trim() === walletAddress?.trim();
        console.log('[MyBets] Checking bet:', {
          bet_wallet: ub.wallet_address,
          auth_wallet: walletAddress,
          exact_match: match,
          trimmed_match: trimmedMatch,
        });
        if (match) console.log('[MyBets] ✓ Found bet:', ub.id, ub.amount, ub.status);
        if (trimmedMatch && !match) console.log('[MyBets] ⚠️ Trimmed match (whitespace issue):', ub.id);
        return match;
      }) : [];
      console.log('[MyBets] My bets:', filtered.length);
      if (walletAddress) return filtered;
      if (user?.id) return all.filter((ub) => ub.created_by_id === user.id);
      return [];
    },
    enabled: !!walletAddress || !!user,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true
  });

  // LP offers for the LP tab
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list()
  });

  // Filter: Regular bets show in My Bets, LP positions show ONLY in LP Dashboard
  // LP positions are identified by: role='lp'
  const myMatcherBets = myBets.filter(b => b.role !== 'lp');
  
  // Group bets by match_id + outcome (combine multiple bets on same outcome)
  const groupedBets = myMatcherBets.reduce((acc, bet) => {
    const key = `${bet.match_id}-${bet.outcome}`;
    if (!acc[key]) {
      acc[key] = {
        ...bet,
        totalAmount: bet.amount || 0,
        totalPayout: bet.actual_payout || bet.potential_payout || 0,
        betCount: 1,
        betIds: [bet.id]
      };
    } else {
      acc[key].totalAmount += bet.amount || 0;
      acc[key].totalPayout += bet.actual_payout || bet.potential_payout || 0;
      acc[key].betCount += 1;
      acc[key].betIds.push(bet.id);
      // Use the most recent status
      if (new Date(bet.created_date) > new Date(acc[key].created_date)) {
        acc[key].status = bet.status;
      }
    }
    return acc;
  }, {});
  
  const groupedBetsArray = Object.values(groupedBets);
  
  const totalStaked = groupedBetsArray.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const totalWon = groupedBetsArray.filter((b) => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.totalPayout || 0), 0);
  const activeBets = groupedBetsArray.filter((b) => b.status === 'active' || b.status === 'pending');
  const completedBets = groupedBetsArray.filter((b) => b.status !== 'active' && b.status !== 'pending');
  const pendingClaims = groupedBetsArray.filter((b) => b.status === 'won');
  const availableRefunds = groupedBetsArray.filter((b) => b.status === 'refunded');
  const myLpPositions = myBets.filter(b => b.role === 'lp');

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
        await base44.entities.UserBet.update(betId, { 
          status: 'claimed',
          actual_payout: claimData.totalPayout / claimData.betIds.length
        });
      }
    }
    setClaimData(null);
    setBatchClaimMatchId(null);
    // Force immediate refetch instead of just invalidation
    await queryClient.refetchQueries({ queryKey: ['myBets'], type: 'active' });
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
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
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track your World Cup betting performance
            {walletAddress && <span className="ml-2 text-[10px] font-mono opacity-50">({walletAddress.slice(0, 6)}...{walletAddress.slice(-4)})</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm">
            <Activity className="w-4 h-4" />
            Refresh
          </Button>
          <Link to="/matches">
            <Button variant="outline" className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Browse Matches</span>
              <span className="sm:hidden">Matches</span>
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="bets" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-card border border-border/50 rounded-xl">
          <TabsTrigger value="bets" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg text-xs sm:text-sm">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">My Bets ({myMatcherBets.length})</span>
            <span className="sm:hidden">Bets</span>
          </TabsTrigger>
          <TabsTrigger value="lp" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg text-xs sm:text-sm">
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">LP ({myLpPositions.length})</span>
            <span className="sm:hidden">LP</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg text-xs sm:text-sm">
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Stats</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg text-xs sm:text-sm">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">History ({completedBets.length})</span>
            <span className="sm:hidden">History</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bets">
          {groupedBetsArray.filter(b => b.status === 'active' || b.status === 'pending' || b.status === 'won').length > 0 ?
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {groupedBetsArray.filter(b => b.status === 'active' || b.status === 'pending' || b.status === 'won').map((bet, i) =>
            <BetCard
              key={bet.betIds[0]}
              bet={bet}
              index={i}
              walletAddress={walletAddress}
              onRefundRequest={(data) => setRefundDialog(data)} />

            )}
            </div> :

          <EmptyState message="No active bets" actionText="Browse Matches" link="/matches" />
          }
        </TabsContent>

        <TabsContent value="lp">
          {myLpPositions.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {myLpPositions.map((lp, i) => (
                <LpPositionCard
                  key={lp.id}
                  offer={lp}
                  index={i}
                  walletAddress={walletAddress}
                  onWithdrawRequest={(data) => setRefundDialog(data)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No LP positions" actionText="Provide Liquidity" link="/lp" />
          )}
        </TabsContent>

        <TabsContent value="stats">
          <div className="space-y-4">
            {/* Main Stats */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatCard
                label="Total Staked"
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

            {/* Quick Stats */}
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
              
              <QuickStat
                label="Completed Bets"
                value={completedBets.length}
                icon={Activity}
                color="bg-muted text-muted-foreground" />
              
            </div>

            {/* Performance Summary */}
            <div className="bg-card border border-border/50 rounded-xl p-4 sm:p-5">
              <h3 className="font-heading font-bold text-sm sm:text-base mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Performance Summary
              </h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-muted-foreground">Total Bets Placed</span>
                  <span className="font-bold">{myBets.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-muted-foreground">Won / Lost</span>
                  <span className="font-bold">
                    <span className="text-accent">{myBets.filter(b => b.status === 'won' || b.status === 'claimed').length}</span>
                    {' / '}
                    <span className="text-destructive">{myBets.filter(b => b.status === 'lost').length}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-muted-foreground">Net P/L</span>
                  <span className={`font-bold ${totalWon - totalStaked >= 0 ? 'text-accent' : 'text-destructive'}`}>
                    ◎{(totalWon - totalStaked).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Average Bet Size</span>
                  <span className="font-bold">◎{myBets.length > 0 ? (totalStaked / myBets.length).toFixed(4) : '0.0000'}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          {groupedBetsArray.filter(b => ['lost', 'claimed', 'refunded', 'void'].includes(b.status)).length > 0 ?
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {groupedBetsArray.filter(b => ['lost', 'claimed', 'refunded', 'void'].includes(b.status)).map((bet, i) =>
            <BetCard
              key={bet.betIds[0]}
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