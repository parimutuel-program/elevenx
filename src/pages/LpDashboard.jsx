import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, ArrowRight, Plus, Clock, CheckCircle2, AlertCircle, ExternalLink, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import FuturesLpPanel from '@/components/lp/FuturesLpPanel';
import MatchLiquidityCard from '@/components/lp/MatchLiquidityCard';
import LiquidityDetailModal from '@/components/lp/LiquidityDetailModal';
import LpPositionCard from '@/components/lp/LpPositionCard';

const SuccessDialog = ({ open, onClose, data, isWithdraw }) => {
  const solscanUrl = `https://solscan.io/tx/${data?.signature}?cluster=devnet`;
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-accent" />
            {isWithdraw ? 'Liquidity Withdrawn!' : 'Liquidity Provided!'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className={`${isWithdraw ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-accent/10 border-accent/30'} border rounded-xl p-4 text-center`}>
            <p className="text-sm text-muted-foreground">{isWithdraw ? 'You withdrew' : 'You committed'}</p>
            <p className={`font-heading font-bold text-2xl ${isWithdraw ? 'text-yellow-400' : 'text-accent'}`}>◎{data?.amount.toFixed(4)} SOL</p>
            {!isWithdraw && (
              <>
                <p className="text-xs text-muted-foreground mt-2">for <span className="text-foreground font-bold">{data?.team}</span></p>
                <p className="text-[10px] text-muted-foreground">{data?.match}</p>
              </>
            )}
          </div>
          
          <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Transaction Signature:</p>
            <p className="text-xs font-mono text-primary break-all">{data?.signature}</p>
          </div>
          
          <Button
            onClick={() => {
              window.open(solscanUrl, '_blank');
              onClose();
            }}
            className="w-full h-11 font-heading font-bold rounded-xl"
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View on Solscan
          </Button>
          
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
};

export default function LpDashboard() {
  const { user } = useAuth();
  const { isConnected, connect, walletAddress } = useWallet();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('matches');
  const [selectedBet, setSelectedBet] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('a');
  const [amount, setAmount] = useState('');
  const [pendingTx, setPendingTx] = useState(null);
  const [successDialog, setSuccessDialog] = useState(null);
  const [withdrawSuccessDialog, setWithdrawSuccessDialog] = useState(null);
  const [error, setError] = useState(null);
  const [activeGroup, setActiveGroup] = useState('all');
  const [matchViewMode, setMatchViewMode] = useState('all');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedBetForDetail, setSelectedBetForDetail] = useState(null);

  const { data: openBets = [] } = useQuery({
    queryKey: ['openBets'],
    queryFn: () => base44.entities.Bet.filter({ status: 'open' }),
  });

  const { data: myOffers = [], refetch: refetchOffers } = useQuery({
    queryKey: ['myOffers', walletAddress],
    queryFn: () => base44.entities.BetOffer.list('-created_date', 100),
    enabled: !!walletAddress,
    select: (offers) => offers.filter(o => o.lp_wallet_address === walletAddress),
    refetchOnWindowFocus: true,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list(),
  });

  // Extract unique groups from open bets, plus all World Cup groups A-L
  const groupSet = new Set(openBets.map(bet => {
    const match = matches.find(m => m.id === bet.match_id);
    return match?.group_stage;
  }).filter(Boolean));
  
  // Ensure all World Cup groups A-L are included
  const allWorldCupGroups = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F', 'Group G', 'Group H', 'Group I', 'Group J', 'Group K', 'Group L'];
  allWorldCupGroups.forEach(g => groupSet.add(g));
  
  const groups = ['all', ...Array.from(groupSet).sort()];

  // Filter open bets by active group
  const filteredOpenBets = openBets.filter(bet => {
    if (activeGroup !== 'all') {
      const match = matches.find(m => m.id === bet.match_id);
      if (!match || match.group_stage !== activeGroup) return false;
    }
    return true;
  });

  const { data: futuresMarkets = [] } = useQuery({
    queryKey: ['futuresMarkets'],
    queryFn: () => base44.entities.FuturesMarket.filter({ status: 'open' }),
  });

  const [pendingCommitData, setPendingCommitData] = useState(null);
  const [modalTransactionMode, setModalTransactionMode] = useState(false);

  const provideLiquidityMutation = useMutation({
    mutationFn: async (params) => {
      const { walletAddress: wallet, bet_id, match_id, outcome, amount: amt } = params;
      const amountNum = parseFloat(amt);
      
      if (!amountNum || amountNum <= 0) throw new Error('Invalid amount');
      if (!wallet) throw new Error('Wallet not connected');

      console.log('[provideLiquidity] Calling with:', {
        wallet,
        bet_id,
        match_id,
        outcome,
        amount: amountNum,
      });

      const res = await base44.functions.invoke('provideLiquidity', {
        walletAddress: wallet,
        bet_id,
        match_id,
        outcome,
        amount: amountNum,
      });

      console.log('[provideLiquidity] Response:', res.data);

      if (res.data.error) throw new Error(res.data.error);
      if (!res.data.solana_instruction) {
        throw new Error(res.data.hint || 'Market not initialized on-chain.');
      }
      return res.data;
    },
    onSuccess: (data, variables) => {
      console.log('[provideLiquidity] Success, setting pending tx');
      const amountNum = parseFloat(variables.amount);
      setPendingTx({
        instruction: data.solana_instruction,
        amount: amountNum || 0,
        type: 'provide_liquidity',
      });
      setPendingCommitData(data.commit_data);
    },
    onError: (err) => {
      console.error('[provideLiquidity] Error:', err);
      setError(err.message || 'Failed to provide liquidity');
    },
  });

  const withdrawLiquidityMutation = useMutation({
    mutationFn: async (offer) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      if (!offer.userBetId) {
        console.error('[withdrawLiquidityMutation] Missing userBetId in offer:', offer);
        throw new Error('No user bet found for this offer');
      }
      
      // Fetch the UserBet to check its status before calling withdraw
      const userBets = await base44.entities.UserBet.filter({ id: offer.userBetId });
      const userBet = userBets[0];
      console.log('[withdrawLiquidityMutation] UserBet found:', userBet);
      
      if (!userBet) throw new Error('UserBet not found');
      if (userBet.role !== 'lp') throw new Error('Not an LP bet');
      // Allow withdrawal for any LP position - backend will check if unmatched funds exist
      
      console.log('[withdrawLiquidityMutation] Calling withdrawLiquidity with:', { walletAddress, userBetId: offer.userBetId });
      
      const res = await base44.functions.invoke('withdrawLiquidity', {
        walletAddress,
        userBetId: offer.userBetId,
      });
      
      console.log('[withdrawLiquidityMutation] Response:', res.data);
      
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      console.log('[withdrawLiquidityMutation] Success:', data);
      setPendingTx({
        instruction: data.solana_instruction,
        amount: data.amount,
        type: 'withdraw_liquidity',
        userBetId: data.userBetId,
        offerId: data.offerId,
      });
    },
    onError: (err) => {
      console.error('[withdrawLiquidityMutation] Error:', err);
      setError(err.message || 'Failed to withdraw liquidity');
    },
  });

  const handleTxSuccess = async (txResult) => {
    const signature = txResult.signature;
    const committedAmount = pendingTx?.amount || 0;
    
    if (pendingCommitData) {
      try {
        const commitRes = await base44.functions.invoke('commitLiquidity', {
          signature,
          commit_data: pendingCommitData,
        });
        if (commitRes.data.error) {
          console.error('[LpDashboard] commitLiquidity error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[LpDashboard] commitLiquidity threw:', err);
      }
      setPendingCommitData(null);
    }
    
    // Use the outcome from pendingCommitData (which has the actual selected outcome)
    const outcomeLabel = pendingCommitData?.outcome_label || selectedBet?.outcome_a || 'Unknown';
    const matchTitle = pendingCommitData?.match_title || selectedBet ? `${selectedBet.outcome_a} vs ${selectedBet.outcome_b}` : 'Market';
    
    setSuccessDialog({
      signature,
      amount: committedAmount,
      team: outcomeLabel,
      match: matchTitle,
    });
    
    setPendingTx(null);
    setAmount('');
    setSelectedBet(null);
    setModalTransactionMode(false);
    setDetailModalOpen(false);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['openBets'] });
    queryClient.invalidateQueries({ queryKey: ['allOffers', pendingCommitData?.bet_id] });
    queryClient.invalidateQueries({ queryKey: ['allOffers'] });
    console.log('[LpDashboard] Invalidated queries for bet_id:', pendingCommitData?.bet_id);
  };

  const handleTxError = (err) => {
    setPendingTx(null);
    setModalTransactionMode(false);
  };

  const handleWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    
    if (pendingTx?.userBetId && pendingTx?.offerId) {
      try {
        const commitRes = await base44.functions.invoke('finalizeWithdrawal', {
          signature,
          userBetId: pendingTx.userBetId,
          offerId: pendingTx.offerId,
        });
        if (commitRes.data.error) {
          console.error('[LpDashboard] finalizeWithdrawal error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[LpDashboard] finalizeWithdrawal threw:', err);
      }
    }
    
    setWithdrawSuccessDialog({
      signature,
      amount: pendingTx?.amount || 0,
    });
    
    setPendingTx(null);
    setError(null);
    // Invalidate queries immediately to remove withdrawn position
    queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['allUserBets', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['offersWithUserBet', walletAddress] });
  };

  // Stats
  const totalCommitted = myOffers.reduce((s, o) => s + (o.amount_offered || 0), 0);
  const totalMatched   = myOffers.reduce((s, o) => s + (o.amount_matched || 0), 0);
  const totalUnmatched = myOffers.reduce((s, o) => s + (o.amount_unmatched || 0), 0);
  const activeOffers   = myOffers.filter(o => o.status === 'open' || o.status === 'partially_matched');
  
  const { data: allUserBets = [], refetch: refetchUserBets } = useQuery({
    queryKey: ['allUserBets', walletAddress],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 200);
      return all.filter(ub => ub.wallet_address === walletAddress && ub.role === 'lp');
    },
    enabled: !!walletAddress,
  });
  
  // Don't group offers - show each LP position separately for individual withdrawal
  const offersWithUserBet = myOffers.map(offer => {
    const userBet = allUserBets.find(ub => ub.offer_id === offer.id);
    if (!userBet) return null; // Skip offers without a linked UserBet
    
    return {
      ...offer,
      userBetId: userBet.id, // Single userBetId for withdrawal
      userBetIds: [userBet.id],
    };
  }).filter(Boolean);

  const getMatchTitle = (matchId) => {
    const m = matches.find(m => m.id === matchId);
    return m ? `${m.team_a_flag || ''} ${m.team_a} vs ${m.team_b} ${m.team_b_flag || ''}` : 'Unknown Match';
  };

  const getOutcomeLabel = (offer) => {
    if (offer.outcome === 'a') return offer.outcome_label || 'Team A';
    if (offer.outcome === 'b') return offer.outcome_label || 'Team B';
    return 'Draw';
  };

  const [pendingFuturesTx, setPendingFuturesTx] = useState(null);
  const [pendingFuturesCommit, setPendingFuturesCommit] = useState(null);

  const handleFuturesLiquidity = async (outcome, amount) => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    
    try {
      const res = await base44.functions.invoke('provideFuturesLiquidity', {
        walletAddress,
        market_id: outcome.market_id,
        outcome_label: outcome.label,
        outcome_flag: outcome.flag,
        odds: outcome.odds,
        amount,
      });
      
      if (res.data.error) {
        alert('Error: ' + res.data.error);
        return;
      }
      
      if (res.data.solana_instruction) {
        setPendingFuturesTx({
          instruction: res.data.solana_instruction,
          amount,
          type: 'provide_futures_liquidity',
        });
        setPendingFuturesCommit(res.data.commit_data);
      }
    } catch (error) {
      alert('Failed to provide liquidity: ' + error.message);
    }
  };

  const handleFuturesTxSuccess = async (txResult) => {
    const signature = txResult.signature;
    
    if (pendingFuturesCommit) {
      try {
        const commitRes = await base44.functions.invoke('commitFuturesLiquidity', {
          signature,
          commit_data: pendingFuturesCommit,
        });
        if (commitRes.data.error) {
          console.error('[LpDashboard] commitFuturesLiquidity error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[LpDashboard] commitFuturesLiquidity threw:', err);
      }
      setPendingFuturesCommit(null);
    }
    
    setSuccessDialog({
      signature,
      amount: pendingFuturesTx?.amount || 0,
      team: pendingFuturesCommit?.outcome_label || 'Futures',
      match: 'Tournament Market',
    });
    
    setPendingFuturesTx(null);
    queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['allOffers', pendingFuturesCommit?.bet_id] });
  };

  const handleDetailModalCommit = ({ bet, outcome, amount, potentialLiability }) => {
    // Check wallet is connected
    if (!walletAddress) {
      setError('Wallet not connected. Please connect Phantom first.');
      return;
    }
    
    console.log('[handleDetailModalCommit] Triggering with:', { walletAddress, bet_id: bet.id, outcome, amount });
    
    // Set modal to transaction mode (don't close yet)
    setModalTransactionMode(true);
    
    // Trigger mutation directly with params
    provideLiquidityMutation.mutate({
      walletAddress,
      bet_id: bet.id,
      match_id: bet.match_id,
      outcome,
      amount: String(amount),
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full px-0 sm:px-4">
      <SuccessDialog open={!!successDialog} data={successDialog} onClose={() => setSuccessDialog(null)} />
      <SuccessDialog open={!!withdrawSuccessDialog} data={withdrawSuccessDialog} onClose={() => setWithdrawSuccessDialog(null)} isWithdraw={true} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-black text-xl sm:text-2xl mb-1">LP Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Provide liquidity for matches & futures</p>
        </div>
      </div>

      {/* ── BRANDED LP EXPLANATION BANNER ── */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-[#1a1040]/80 via-[#0f0a1e]/90 to-[#12102a]/80 border border-primary/20 rounded-2xl p-4 sm:p-6 relative overflow-hidden mb-4 sm:mb-6"
      >
        {/* Decorative Glow Orbs */}
        <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 rounded-full blur-2xl opacity-25 bg-[#a69cf2]" />
        <div className="absolute bottom-0 left-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full blur-2xl opacity-15 bg-[#14f195]" />

        <div className="relative z-10 space-y-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-2.5 sm:px-3 py-1 rounded-full text-primary text-[8px] sm:text-[10px] font-bold tracking-widest uppercase">
              👑 Be the House
            </div>
            <h2 className="font-heading font-black text-base sm:text-lg md:text-xl text-white">How Liquidity Providing Works</h2>
            <p className="text-[10px] sm:text-xs text-white/70 leading-relaxed">
              ElevenX has no house edge. Instead, <strong>YOU</strong> act as the bookmaker and take the other side!
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/10 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl">🎯</span>
              <h3 className="font-heading font-bold text-xs sm:text-xs text-primary">1. Back Your Team</h3>
            </div>
            <p className="text-[9px] sm:text-[11px] text-muted-foreground leading-relaxed">
              Provide liquidity on the outcome you believe will WIN. If it wins, you profit! If it loses, bettors take the pool.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl">💰</span>
              <h3 className="font-heading font-bold text-xs sm:text-xs text-accent">2. Earn Fees + Winnings</h3>
            </div>
            <p className="text-[9px] sm:text-[11px] text-muted-foreground leading-relaxed">
              Earn <strong>2% fees</strong> on every bet matched against your liquidity, plus keep the pool if your outcome wins!
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl">🔓</span>
              <h3 className="font-heading font-bold text-xs sm:text-xs text-yellow-400">3. Full Control</h3>
            </div>
            <p className="text-[9px] sm:text-[11px] text-muted-foreground leading-relaxed">
              Withdraw unmatched liquidity <strong>instantly anytime</strong>. Only locked when matched. <strong>Instant DB claims</strong> — no on-chain delays.
            </p>
          </div>
        </div>
      </motion.div>

      {!isConnected && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/20 p-6 sm:p-8 text-center"
          style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}>
          <Wallet className="w-10 h-10 sm:w-12 sm:h-12 text-primary mx-auto mb-4" />
          <h3 className="font-heading font-black text-lg sm:text-xl text-white mb-2">Connect Wallet to Provide Liquidity</h3>
          <p className="text-white/50 text-xs sm:text-sm mb-5 max-w-xs mx-auto px-4">Connect Phantom to start providing LP liquidity.</p>
          <Button onClick={connect} className="font-heading font-bold px-6 sm:px-8 h-10 sm:h-11 rounded-xl text-sm"
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
            <Wallet className="w-4 h-4 mr-2" /> Connect Phantom
          </Button>
        </motion.div>
      )}

      {isConnected && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-6 bg-secondary/30 p-1.5 rounded-xl gap-2 h-auto">
            <TabsTrigger 
              value="matches" 
              className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <TrendingUp className="w-4 h-4 mr-2 text-primary" /> Match LP
            </TabsTrigger>
            <TabsTrigger 
              value="futures" 
              className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 data-[state=active]:border-b-2 data-[state=active]:border-yellow-400"
            >
              <Trophy className="w-4 h-4 mr-2 text-yellow-400" /> Futures LP
            </TabsTrigger>
            <TabsTrigger 
              value="positions" 
              className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-accent/20 data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent"
            >
              <DollarSign className="w-4 h-4 mr-2 text-accent" /> My LP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="space-y-4 sm:space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Total Committed', value: `◎${totalCommitted.toFixed(4)}`, icon: DollarSign, color: 'text-primary' },
                { label: 'Matched', value: `◎${totalMatched.toFixed(4)}`, icon: CheckCircle2, color: 'text-accent' },
                { label: 'Unmatched', value: `◎${totalUnmatched.toFixed(4)}`, icon: Clock, color: 'text-yellow-400' },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border/50 rounded-xl sm:rounded-2xl p-2.5 sm:p-4">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`font-heading font-bold text-sm sm:text-lg ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Provide liquidity section */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              {error && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 mb-4">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <AlertDescription className="text-destructive text-sm">
                    {error}
                    <Button variant="link" className="p-0 h-auto text-destructive underline ml-2" onClick={() => setError(null)}>Dismiss</Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading font-bold text-sm">Provide Liquidity</h2>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMatchViewMode(matchViewMode === 'all' ? 'dropdown' : 'all')}
                      className="h-6 text-xs"
                    >
                      {matchViewMode === 'all' ? 'Show as List' : 'Show as Grid'}
                    </Button>
                  </div>
                  
                  {matchViewMode === 'dropdown' ? (
                    <div className="space-y-3">
                      <Select onValueChange={(val) => {
                        const bet = filteredOpenBets.find(b => b.id === val);
                        setSelectedBet(bet || null);
                        setSelectedOutcome('a');
                        setError(null);
                      }}>
                        <SelectTrigger className="bg-secondary/50 border-border/50 h-11">
                          <SelectValue placeholder="Choose an open market..." />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredOpenBets.map(bet => (
                            <SelectItem key={bet.id} value={bet.id}>
                              {bet.outcome_a} vs {bet.outcome_b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedBet && (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1.5 block">Select Outcome to Cover</label>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { key: 'a', label: selectedBet.outcome_a, odds: selectedBet.odds_a || selectedBet.oracle_odds_a },
                                { key: 'draw', label: 'Draw', odds: selectedBet.odds_draw || selectedBet.oracle_odds_draw },
                                { key: 'b', label: selectedBet.outcome_b, odds: selectedBet.odds_b || selectedBet.oracle_odds_b },
                              ].map(o => {
                                let displayOdds = '—';
                                if (o.odds) {
                                  const oddsNum = typeof o.odds === 'string' ? parseFloat(o.odds) : o.odds;
                                  displayOdds = oddsNum.toFixed(2) + 'x';
                                }
                                return (
                                  <button key={o.key}
                                    onClick={() => setSelectedOutcome(o.key)}
                                    className={`rounded-lg sm:rounded-xl p-2 sm:p-3 border-2 text-center transition-all ${
                                      selectedOutcome === o.key
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border/50 bg-secondary/30 hover:border-border'
                                    }`}>
                                    <p className="font-heading font-bold text-[10px] sm:text-xs">{o.label}</p>
                                    <p className="text-primary font-bold text-xs sm:text-sm mt-0.5">{displayOdds}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <label className="text-xs text-muted-foreground mb-1.5 block">Amount (◎ SOL)</label>
                            <Input type="number" placeholder="0.00" value={amount}
                              onChange={e => setAmount(e.target.value)}
                              className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
                            <div className="flex gap-2 mt-2">
                              {[0.5, 1, 5, 10].map(qa => (
                                <button key={qa} onClick={() => setAmount(String(qa))}
                                  className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg">◎{qa}</button>
                              ))}
                            </div>
                          </div>

                          <Button
                            onClick={() => provideLiquidityMutation.mutate({
                              walletAddress,
                              bet_id: selectedBet.id,
                              match_id: selectedBet.match_id,
                              outcome: selectedOutcome,
                              amount,
                            })}
                            disabled={!amount || parseFloat(amount) <= 0 || provideLiquidityMutation.isPending}
                            className="w-full h-12 font-heading font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                            {provideLiquidityMutation.isPending ? (
                              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : `Commit ◎${parseFloat(amount) || 0} Liquidity`}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Group Navigation */}
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <button
                          onClick={() => setActiveGroup('all')}
                          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                            activeGroup === 'all'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                          }`}
                        >
                          All Groups
                        </button>
                        {groups.filter(g => g !== 'all' && g !== 'World Cup 2026').map(group => (
                          <button
                            key={group}
                            onClick={() => setActiveGroup(group)}
                            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                              activeGroup === group
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                            }`}
                          >
                            {group}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        {filteredOpenBets.map(bet => {
                          const match = matches.find(m => m.id === bet.match_id);
                          return (
                            <MatchLiquidityCard
                              key={bet.id}
                              bet={bet}
                              match={match}
                              isSelected={selectedBet?.id === bet.id}
                              onClick={() => {
                                setSelectedBetForDetail({ bet, match });
                                setDetailModalOpen(true);
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            </motion.div>


          </TabsContent>

          <TabsContent value="futures" className="space-y-6">
            {pendingFuturesTx && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
                  <div className="space-y-4">
                    <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                      <p className="text-sm font-bold text-accent mb-1">Provide Futures Liquidity</p>
                      <p className="text-xs text-muted-foreground">Sign transaction to provide LP liquidity</p>
                    </div>
                    <SolanaTransactionSigner
                      instruction={pendingFuturesTx.instruction}
                      amount={pendingFuturesTx.amount}
                      onSuccess={handleFuturesTxSuccess}
                      onError={(err) => {
                        alert('Transaction failed: ' + err.message);
                        setPendingFuturesTx(null);
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={() => setPendingFuturesTx(null)} className="w-full">
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <FuturesLpPanel
              futuresMarkets={futuresMarkets}
              onProvideLiquidity={handleFuturesLiquidity}
              isConnected={isConnected}
              connect={connect}
            />
          </TabsContent>

          <TabsContent value="positions" className="space-y-4 sm:space-y-6">
            {/* My LP Positions Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Total Committed', value: `◎${totalCommitted.toFixed(4)}`, icon: DollarSign, color: 'text-primary' },
                { label: 'Matched', value: `◎${totalMatched.toFixed(4)}`, icon: CheckCircle2, color: 'text-accent' },
                { label: 'Unmatched', value: `◎${totalUnmatched.toFixed(4)}`, icon: Clock, color: 'text-yellow-400' },
                { label: 'Active Offers', value: activeOffers.length.toString(), icon: TrendingUp, color: 'text-chart-2' },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border/50 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <s.icon className={`w-3 h-3 sm:w-4 sm:h-4 ${s.color}`} />
                    <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  </div>
                  <p className={`font-heading font-bold text-base sm:text-lg ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* LP Positions List */}
            <div className="space-y-3">
              <h2 className="font-heading font-bold text-sm text-muted-foreground">Your LP Positions</h2>
              {offersWithUserBet.length === 0 ? (
                <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
                  <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-heading font-bold text-sm text-muted-foreground mb-1">No LP positions yet</p>
                  <p className="text-xs text-muted-foreground">Provide liquidity to start earning fees</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-4">
                  {offersWithUserBet.map((offer) => {
                    const match = matches.find(m => m.id === offer.match_id);
                    const potentialEarnings = (offer.amount_matched || 0) * 0.02; // 2% fee
                    const matchPct = offer.amount_offered > 0 ? ((offer.amount_matched || 0) / offer.amount_offered * 100) : 0;
                    const isFullyMatched = offer.status === 'fully_matched';
                    const isPartiallyMatched = offer.status === 'partially_matched';
                    const hasUnmatched = (offer.amount_unmatched || 0) > 0;

                    const getOutcomeLabel = () => {
                      if (offer.outcome === 'a') return offer.outcome_label || match?.team_a || 'Team A';
                      if (offer.outcome === 'b') return offer.outcome_label || match?.team_b || 'Team B';
                      return 'Draw';
                    };

                    const currentStatus = {
                      open: { bg: 'bg-primary/10', border: 'border-primary/30', color: 'text-primary' },
                      partially_matched: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', color: 'text-yellow-400' },
                      fully_matched: { bg: 'bg-accent/10', border: 'border-accent/30', color: 'text-accent' },
                    }[offer.status] || { bg: 'bg-muted/10', border: 'border-muted/30', color: 'text-muted-foreground' };

                    return (
                      <LpPositionCard
                        key={offer.id}
                        offer={offer}
                        match={match}
                        potentialEarnings={potentialEarnings}
                        matchPct={matchPct}
                        isFullyMatched={isFullyMatched}
                        isPartiallyMatched={isPartiallyMatched}
                        hasUnmatched={hasUnmatched}
                        currentStatus={currentStatus}
                        getOutcomeLabel={getOutcomeLabel}
                        onWithdraw={(o) => {
                          console.log('[onWithdraw] Called with offer:', {
                            userBetId: o.userBetId,
                            amount_unmatched: o.amount_unmatched,
                            status: o.status,
                            match_id: o.match_id,
                            outcome: o.outcome,
                          });
                          withdrawLiquidityMutation.mutate(o);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Withdraw Transaction Signer */}
            {pendingTx && pendingTx.type === 'withdraw_liquidity' && (
              <SolanaTransactionSigner
                instruction={pendingTx.instruction}
                amount={pendingTx.amount}
                onSuccess={handleWithdrawSuccess}
                onError={() => setPendingTx(null)}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Detail Modal */}
      <LiquidityDetailModal
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedBetForDetail(null);
        }}
        bet={selectedBetForDetail?.bet}
        match={selectedBetForDetail?.match}
        isLoading={provideLiquidityMutation.isPending}
        onCommit={(data) => {
          console.log('[LpDashboard] onCommit called with:', data);
          handleDetailModalCommit(data);
        }}
      />

      {/* Transaction Modal Overlay */}
      {pendingTx && pendingTx.type === 'provide_liquidity' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
            <div className="space-y-4">
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <p className="text-sm font-bold text-accent mb-1">Provide Liquidity</p>
                <p className="text-xs text-muted-foreground">Sign transaction to complete</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingTx.instruction}
                amount={pendingTx.amount}
                onSuccess={handleTxSuccess}
                onError={handleTxError}
              />
              <Button variant="outline" size="sm" onClick={() => setPendingTx(null)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}