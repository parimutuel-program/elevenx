import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, DollarSign, Target, Flame, Shield, BarChart3, Activity, Award, TrendingUp, Clock, Wallet, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import StatCard from '@/components/dashboard/StatCard';
import QuickStat from '@/components/dashboard/QuickStat';
import EmptyState from '@/components/dashboard/EmptyState';
import BetCard from '@/components/dashboard/BetCard';

import { getWalletFromAuth } from '@/utils/auth';
import { useWallet } from '@/lib/WalletContext';

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
  const [showAllBets, setShowAllBets] = useState(false);

  // Get wallet from auth token + currently connected Phantom wallet
  const { walletAddress: phantomWallet } = useWallet();
  const authWallet = getWalletFromAuth();
  // Use auth wallet as primary, but also match against connected Phantom wallet
  const walletAddress = authWallet || phantomWallet;
  // Collect all wallet addresses to show bets from (current session + connected wallet)
  const allMyWallets = [...new Set([authWallet, phantomWallet].filter(Boolean))];

  const { data: myBets = [], isLoading, refetch } = useQuery({
    queryKey: ['myBets', authWallet, phantomWallet, user?.id],
    queryFn: async () => {
      console.log('[MyBets] Query executing, wallets:', { authWallet, phantomWallet, allMyWallets, userId: user?.id });
      const all = await base44.entities.UserBet.list('-created_date', 100);
      console.log('[MyBets] Total bets in DB:', all.length);
      console.log('[MyBets] All bets:', all.map(b => ({ id: b.id, wallet: b.wallet_address?.slice(0, 8), amount: b.amount, status: b.status, role: b.role, created_by: b.created_by_id })));
      
      // CRITICAL FIX: Filter by wallet address OR by created_by_id (user account)
      // This ensures bets from ALL your wallets show up, not just currently connected ones
      const filtered = all.filter((ub) => {
        // Match by any wallet address
        const walletMatch = allMyWallets.length > 0 && allMyWallets.some(w => ub.wallet_address?.trim() === w?.trim());
        // Match by user account (for bets from other wallets you've used)
        const userMatch = user?.id && ub.created_by_id === user.id;
        
        const matches = walletMatch || userMatch;
        console.log('[MyBets] Bet filter check:', { 
          bet_id: ub.id, 
          bet_wallet: ub.wallet_address?.slice(0, 8), 
          bet_created_by: ub.created_by_id,
          walletMatch, 
          userMatch,
          matches 
        });
        return matches;
      });
      
      console.log('[MyBets] Filtered bets:', filtered.length, filtered.map(b => ({ id: b.id, role: b.role, status: b.status, wallet: b.wallet_address?.slice(0, 8) })));
      return filtered;
    },
    enabled: !!user || allMyWallets.length > 0,
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
  console.log('[MyBets] myBets (raw from DB):', myBets.map(b => ({ id: b.id, role: b.role, match_title: b.match_title, futures_market_id: b.futures_market_id, status: b.status })));
  const myMatcherBets = myBets.filter(b => b.role !== 'lp');
  const myLpBets = myBets.filter(b => b.role === 'lp');
  console.log('[MyBets] myMatcherBets (filtered):', myMatcherBets.length, myMatcherBets);
  console.log('[MyBets] myLpBets (LP positions):', myLpBets.length, myLpBets.map(b => ({ id: b.id, role: b.role, status: b.status })));
  
  // Debug toggle: show all bets including LP positions
  const displayBets = showAllBets ? myBets : myMatcherBets;
  
  // Separate futures bets from match bets
  // Futures bets have futures_market_id (primary indicator)
  console.log('[MyBets] displayBets:', displayBets.map(b => ({ id: b.id, match_title: b.match_title, futures_market_id: b.futures_market_id, role: b.role })));
  const myFuturesBets = displayBets.filter(b => {
    const isFutures = !!b.futures_market_id;
    console.log('[MyBets] Checking futures:', { id: b.id, match_title: b.match_title, futures_market_id: b.futures_market_id, isFutures });
    return isFutures;
  });
  console.log('[MyBets] myFuturesBets result:', myFuturesBets.length, myFuturesBets);
  const myMatchBets = displayBets.filter(b => {
    const isMatch = b.match_id && !b.futures_market_id;
    console.log('[MyBets] Match bet:', { id: b.id, match_title: b.match_title, isMatch });
    return isMatch;
  });
  
  console.log('[MyBets] Classified bets:', {
    total: myMatcherBets.length,
    futures: myFuturesBets.map(b => ({ id: b.id, match_title: b.match_title, futures_market_id: b.futures_market_id, status: b.status })),
    matches: myMatchBets.map(b => ({ id: b.id, match_title: b.match_title, status: b.status }))
  });
  
  // Group match bets by match_id + outcome
  const groupedMatchBets = myMatchBets.reduce((acc, bet) => {
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
      if (new Date(bet.created_date) > new Date(acc[key].created_date)) {
        acc[key].status = bet.status;
      }
    }
    return acc;
  }, {});
  
  // Group futures bets by futures_market_id (or match_id if no futures_market_id) + outcome
  const groupedFuturesBets = myFuturesBets.reduce((acc, bet) => {
    const marketId = bet.futures_market_id || bet.match_id || 'unknown';
    const key = `${marketId}-${bet.outcome}`;
    if (!acc[key]) {
      acc[key] = {
        ...bet,
        totalAmount: bet.amount || 0,
        totalPayout: bet.actual_payout || bet.potential_payout || 0,
        betCount: 1,
        betIds: [bet.id],
        _isFutures: true
      };
    } else {
      acc[key].totalAmount += bet.amount || 0;
      acc[key].totalPayout += bet.actual_payout || bet.potential_payout || 0;
      acc[key].betCount += 1;
      acc[key].betIds.push(bet.id);
      if (new Date(bet.created_date) > new Date(acc[key].created_date)) {
        acc[key].status = bet.status;
      }
    }
    return acc;
  }, {});
  
  const groupedMatchBetsArray = Object.values(groupedMatchBets);
  const groupedFuturesBetsArray = Object.values(groupedFuturesBets);
  
  console.log('[MyBets] GROUPED FUTURES:', groupedFuturesBetsArray.map(b => ({
    key: `${b.futures_market_id || b.match_id}-${b.outcome}`,
    betIds: b.betIds,
    status: b.status,
    outcome: b.outcome_label,
    totalAmount: b.totalAmount
  })));
  
  // Debug: Check which futures bets pass the filter
  console.log('[MyBets] Futures statuses (raw):', groupedFuturesBetsArray.map(b => ({
    betIds: b.betIds,
    status: JSON.stringify(b.status),
    statusLength: b.status?.length,
    statusTrimmed: b.status?.trim(),
    outcome: b.outcome_label
  })));
  const futuresForMyBets = groupedFuturesBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status));
  console.log('[MyBets] Futures for My Bets tab:', futuresForMyBets.length, futuresForMyBets.map(b => ({
    betIds: b.betIds,
    status: b.status,
    outcome: b.outcome_label
  })));
  
  const totalStaked = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].reduce((s, b) => s + (b.totalAmount || 0), 0);
  const totalWon = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].filter((b) => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.totalPayout || 0), 0);
  const totalClaimed = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].filter((b) => b.status === 'claimed').reduce((s, b) => s + (b.totalPayout || 0), 0);
  const activeBets = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].filter((b) => b.status === 'active' || b.status === 'pending');
  const completedBets = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].filter((b) => b.status !== 'active' && b.status !== 'pending');
  const pendingClaims = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].filter((b) => b.status === 'won');
  const availableRefunds = [...groupedMatchBetsArray, ...groupedFuturesBetsArray].filter((b) => b.status === 'refunded');
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
      console.log('[MyBets] Finalizing claim via backend:', claimData.betIds);
      try {
        await base44.functions.invoke('finalizeClaim', {
          userBetId: claimData.betIds[0],
          batchBetIds: claimData.betIds,
          signature: claimData.signature
        });
        console.log('[MyBets] ✓ Backend finalized claim');
      } catch (err) {
        console.error('[MyBets] Failed to finalize claim:', err);
      }
    }
    setClaimData(null);
    setBatchClaimMatchId(null);
    
    // Aggressive cache clear and refetch
    await queryClient.cancelQueries({ queryKey: ['myBets'] });
    await queryClient.cancelQueries({ queryKey: ['myBets', walletAddress] });
    queryClient.removeQueries({ queryKey: ['myBets'] });
    queryClient.removeQueries({ queryKey: ['myBets', walletAddress] });
    
    // Force a complete refetch from the database
    await queryClient.refetchQueries({ queryKey: ['myBets', walletAddress], type: 'all' });
    await queryClient.refetchQueries({ queryKey: ['myBets'], type: 'all' });
    
    console.log('[MyBets] Cache cleared and refetched');
  };

  // Debug: Log all bets and their wallet addresses
  console.log('[MyBets DEBUG] ===== BET FILTERING DEBUG =====');
  console.log('[MyBets DEBUG] All wallets to match:', allMyWallets);
  console.log('[MyBets DEBUG] Total bets in myBets:', myBets.length);
  myBets.forEach((bet, idx) => {
    console.log(`[MyBets DEBUG] Bet #${idx + 1}:`, {
      id: bet.id,
      wallet: bet.wallet_address,
      role: bet.role,
      status: bet.status,
      amount: bet.amount,
      match_title: bet.match_title,
      futures_market_id: bet.futures_market_id,
      matches_wallet: allMyWallets.some(w => bet.wallet_address?.trim() === w?.trim()),
      created_by: bet.created_by_id
    });
  });
  console.log('[MyBets DEBUG] ========================================');

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
          {/* Debug: Show all wallets being checked */}
          {allMyWallets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono">
              <span className="text-muted-foreground">Checking wallets:</span>
              {allMyWallets.map(w => (
                <span key={w} className="px-2 py-0.5 bg-secondary/50 rounded text-primary">
                  {w?.slice(0, 6)}...{w?.slice(-4)}
                </span>
              ))}
              {user?.id && (
                <span className="px-2 py-0.5 bg-accent/20 rounded text-accent">
                  User: {user.id.slice(0, 8)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={refetch}
            className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm"
          >
            🔄 Refresh
          </Button>
          <Button 
            variant={showAllBets ? "default" : "outline"}
            onClick={() => setShowAllBets(!showAllBets)}
            className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm"
          >
            {showAllBets ? '✓ Showing All' : 'Show LP Bets'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList className="grid grid-cols-3 mb-6 bg-secondary/30 p-1.5 rounded-xl gap-1 h-auto">
          <TabsTrigger value="stats" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs sm:text-sm">
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Stats
          </TabsTrigger>
          <TabsTrigger value="bets" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs sm:text-sm">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> My Bets
          </TabsTrigger>
          <TabsTrigger value="history" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-accent/20 data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent text-xs sm:text-sm">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bets">
          <div className="space-y-4">
            {/* Match Bets */}
            <div>
              <h3 className="font-heading font-bold text-sm mb-3 text-primary">Match Bets ({groupedMatchBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status)).length})</h3>
              {groupedMatchBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status)).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {groupedMatchBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status)).map((bet, i) => (
                    <BetCard
                      key={bet.betIds[0]}
                      bet={bet}
                      index={i}
                      walletAddress={walletAddress}
                      onRefundRequest={(data) => setRefundDialog(data)} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No match bets</p>
              )}
            </div>
            
            {/* Futures Bets */}
            <div>
              <h3 className="font-heading font-bold text-sm mb-3 text-accent">Futures Bets ({groupedFuturesBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status)).length})</h3>
              {groupedFuturesBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status)).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {groupedFuturesBetsArray.filter(b => ['active', 'pending', 'won'].includes(b.status)).map((bet, i) => (
                    <BetCard
                      key={bet.betIds[0]}
                      bet={bet}
                      index={i}
                      walletAddress={walletAddress}
                      onRefundRequest={(data) => setRefundDialog(data)} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No futures bets</p>
              )}
            </div>
          </div>
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
                label="Total Claimed"
                value={`◎${totalClaimed.toFixed(4)}`}
                icon={CheckCircle}
                color="text-accent"
                delay={0.125} />
              
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
          <div className="space-y-4">
            {/* Match History */}
            {groupedMatchBetsArray.filter(b => ['lost', 'claimed', 'refunded', 'void'].includes(b.status)).length > 0 && (
              <div>
                <h3 className="font-heading font-bold text-sm mb-3 text-primary">Match Bets</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {groupedMatchBetsArray.filter(b => ['lost', 'claimed', 'refunded', 'void'].includes(b.status)).map((bet, i) => (
                    <BetCard
                      key={bet.betIds[0]}
                      bet={bet}
                      index={i}
                      walletAddress={walletAddress}
                      onRefundRequest={(data) => setRefundDialog(data)} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Futures History */}
            {groupedFuturesBetsArray.filter(b => ['lost', 'won', 'claimed', 'refunded', 'void'].includes(b.status)).length > 0 && (
              <div>
                <h3 className="font-heading font-bold text-sm mb-3 text-accent">Futures Bets</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {groupedFuturesBetsArray.filter(b => ['lost', 'won', 'claimed', 'refunded', 'void'].includes(b.status)).map((bet, i) => (
                    <BetCard
                      key={bet.betIds[0]}
                      bet={bet}
                      index={i}
                      walletAddress={walletAddress}
                      onRefundRequest={(data) => setRefundDialog(data)} />
                  ))}
                </div>
              </div>
            )}
            
            {groupedMatchBetsArray.length === 0 && groupedFuturesBetsArray.length === 0 && (
              <EmptyState message="No betting history" />
            )}
          </div>
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
      
      {/* DEBUG PANEL - Shows all bets and filtering */}
      <div className="mt-8 p-4 border border-border/30 rounded-xl bg-secondary/10">
        <h3 className="font-heading font-bold text-sm mb-2 text-muted-foreground">🔍 Debug: All Bets for Your Wallets</h3>
        <div className="text-[10px] font-mono space-y-1 max-h-96 overflow-auto">
          <div className="text-muted-foreground mb-2">
            Checking {allMyWallets.length} wallet(s): {allMyWallets.map(w => w?.slice(0, 8)).join(', ')}
          </div>
          {myBets.length === 0 ? (
            <div className="text-yellow-400">⚠️ No bets found for your wallets! Check if you placed bets with a different wallet.</div>
          ) : (
            myBets.map((bet, idx) => (
              <div key={bet.id} className="p-2 bg-card rounded border border-border/20">
                <div className="flex gap-2 flex-wrap">
                  <span className="text-primary">Bet #{idx + 1}</span>
                  <span className={allMyWallets.some(w => bet.wallet_address?.trim() === w?.trim()) ? 'text-accent' : 'text-destructive'}>
                    {allMyWallets.some(w => bet.wallet_address?.trim() === w?.trim()) ? '✓ Match' : '✗ No Match'}
                  </span>
                  <span className="text-muted-foreground">ID: {bet.id.slice(0, 12)}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Wallet: {bet.wallet_address?.slice(0, 10)}... | 
                  Role: {bet.role} | 
                  Status: {bet.status} | 
                  Amount: ◎{bet.amount} |
                  {bet.futures_market_id ? '🏆 Futures' : '⚽ Match'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>);

}