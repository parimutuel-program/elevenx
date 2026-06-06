import React, { useState, useEffect } from 'react';
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
import { getWalletFromAuth } from '@/utils/auth';

const SuccessDialog = ({ open, onClose, data, isWithdraw }) => {
  const solscanUrl = `https://solscan.io/tx/${data?.signature}?cluster=devnet`;
  const hasLpBonus = data?.lpFeeBonus && data.lpFeeBonus > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-accent" />
            {isWithdraw ? hasLpBonus ? 'LP Winnings + Fee Bonus!' : 'Liquidity Withdrawn!' : 'Liquidity Provided!'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className={`${isWithdraw ? hasLpBonus ? 'bg-accent/10 border-accent/30' : 'bg-yellow-500/10 border-yellow-500/30' : 'bg-accent/10 border-accent/30'} border rounded-xl p-4 text-center`}>
            <p className="text-sm text-muted-foreground">{isWithdraw ? 'Total Withdrawal' : 'You committed'}</p>
            <p className={`font-heading font-bold text-2xl ${isWithdraw ? hasLpBonus ? 'text-accent' : 'text-yellow-400' : 'text-accent'}`}>
              ◎{hasLpBonus ? data?.totalWithdraw?.toFixed(4) : data?.amount?.toFixed(4)} SOL
            </p>
            {hasLpBonus &&
            <div className="mt-3 pt-3 border-t border-accent/20">
                <p className="text-[10px] text-muted-foreground">Base winnings</p>
                <p className="font-heading font-bold text-yellow-400">◎{data?.amount?.toFixed(4)}</p>
                <p className="text-[10px] text-muted-foreground mt-2">+ LP fee bonus (50% of platform fees)</p>
                <p className="font-heading font-bold text-accent">◎{data?.lpFeeBonus?.toFixed(4)}</p>
              </div>
            }
            {!isWithdraw &&
            <>
                <p className="text-xs text-muted-foreground mt-2">for <span className="text-foreground font-bold">{data?.team}</span></p>
                <p className="text-[10px] text-muted-foreground">{data?.match}</p>
              </>
            }
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
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
            
            <ExternalLink className="w-4 h-4 mr-2" />
            View on Solscan
          </Button>
          
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full h-10 text-sm rounded-xl border-border/50">
            
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>);

};

export default function LpDashboard() {
  const { user } = useAuth();
  const { isConnected, connect } = useWallet();
  const queryClient = useQueryClient();

  // Get wallet from auth token (permanent source of truth - not localStorage)
  const walletAddressFromAuth = getWalletFromAuth();
  const walletAddress = walletAddressFromAuth;
  
  // Debug: Log wallet address and query state
  React.useEffect(() => {
    console.log('[LpDashboard] Render:', { walletAddress, isConnected, source: walletAddressFromAuth ? 'auth_token' : 'wallet_context' });
  }, [walletAddress, isConnected]);

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
    queryFn: () => base44.entities.Bet.filter({ status: 'open' })
  });

  const { data: myOffers = [], refetch: refetchOffers, isLoading: isLoadingOffers } = useQuery({
    queryKey: ['myOffers', walletAddress],
    queryFn: async () => {
      console.log('=== LP QUERY STARTED ===');
      console.log('walletAddress (from auth):', walletAddress);
      console.log('enabled:', !!walletAddress);

      // Step 1: Fetch ALL UserBets
      console.log('Step 1: Fetching all UserBets...');
      const allUserBets = await base44.entities.UserBet.list('-created_date', 100);
      console.log('Total UserBets fetched:', allUserBets.length);
      console.log('First 3 UserBets:', allUserBets.slice(0, 3));

      // Step 2: Filter for LP role
      console.log('Step 2: Filtering for role=lp...');
      console.log('Wallet address from auth:', walletAddress);
      console.log('Wallet address length:', walletAddress?.length);
      const lpUserBets = allUserBets.filter((ub) => {
        const walletMatch = ub.wallet_address === walletAddress;
        const roleMatch = ub.role === 'lp';
        const match = walletMatch && roleMatch;
        console.log('Checking UserBet:', ub.id, {
          ub_wallet: ub.wallet_address,
          query_wallet: walletAddress,
          wallet_match: walletMatch,
          role: ub.role,
          role_match: roleMatch,
          final_match: match
        });
        if (match) {
          console.log('✓ LP UserBet found:', ub.id, 'wallet:', ub.wallet_address, 'role:', ub.role);
        }
        return match;
      });

      console.log('LP UserBets found:', lpUserBets.length);
      console.log('LP UserBets:', lpUserBets);

      const offersWithDetails = await Promise.all(lpUserBets.map(async (ub) => {
        console.log('Processing UserBet:', ub.id, 'offer_id:', ub.offer_id);
        let offer = null;

        if (ub.offer_id) {
          try {
            const offers = await base44.entities.BetOffer.filter({ id: ub.offer_id });
            offer = offers[0];
            console.log('Found BetOffer:', offer);
          } catch (err) {
            console.log('BetOffer not found (expected), using fallback:', ub.offer_id);
          }
        }

        // FALLBACK: If no matching BetOffer found, build a virtual offer from UserBet so it displays
        if (!offer) {
          offer = {
            id: ub.offer_id || ub.id,
            bet_id: ub.bet_id,
            match_id: ub.match_id,
            outcome: ub.outcome,
            outcome_label: ub.outcome_label,
            amount_offered: ub.amount,
            amount_matched: ub.liquidity_matched || 0,
            amount_unmatched: ub.liquidity_unmatched || ub.amount,
            status: ub.status === 'active' ? 'open' : ub.status,
            odds_at_creation: ub.amount > 0 ? ub.potential_payout / ub.amount : 2.0,
            lp_wallet_address: ub.wallet_address,
            _isFutures: ub._isFutures || (ub.match_id && ub.match_id === ub.bet_id)
          };
          console.log('Built fallback offer from UserBet:', offer);
        }

        // Ensure _isFutures is set on offer from BetOffer
        if (offer && !offer._isFutures && ub._isFutures) {
          offer._isFutures = true;
        }

        return { ...offer, userBetId: ub.id, userBet: ub };
      }));

      const result = offersWithDetails.filter((o) => o !== null);

      console.log('LP positions after filtering nulls:', result.length);
      console.log('==================');
      return result;
    },
    enabled: !!walletAddress,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    staleTime: 0
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list()
  });

  // Extract unique groups from open bets, plus all World Cup groups A-L
  const groupSet = new Set(openBets.map((bet) => {
    const match = matches.find((m) => m.id === bet.match_id);
    return match?.group_stage;
  }).filter(Boolean));

  // Ensure all World Cup groups A-L are included
  const allWorldCupGroups = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F', 'Group G', 'Group H', 'Group I', 'Group J', 'Group K', 'Group L'];
  allWorldCupGroups.forEach((g) => groupSet.add(g));

  const groups = ['all', ...Array.from(groupSet).sort()];

  // Filter open bets by active group
  const filteredOpenBets = openBets.filter((bet) => {
    if (activeGroup !== 'all') {
      const match = matches.find((m) => m.id === bet.match_id);
      if (!match || match.group_stage !== activeGroup) return false;
    }
    return true;
  });

  const { data: futuresMarkets = [] } = useQuery({
    queryKey: ['futuresMarkets'],
    queryFn: () => base44.entities.FuturesMarket.filter({ status: 'open' })
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
        amount: amountNum
      });

      const res = await base44.functions.invoke('provideLiquidity', {
        walletAddress: wallet,
        bet_id,
        match_id,
        outcome,
        amount: amountNum
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
        type: 'provide_liquidity'
      });
      setPendingCommitData(data.commit_data);
    },
    onError: (err) => {
      console.error('[provideLiquidity] Error:', err);
      // Check if it's an authentication error
      if (err.response?.status === 401 || err.message?.includes('Authentication required') || err.message?.includes('logged in')) {
        const confirmLogin = confirm(
          '⚠️ You need to log in first!\n\n' +
          'Your wallet is connected, but you need a platform account to provide liquidity.\n\n' +
          'Click OK to go to the login/register page, or Cancel to continue browsing.'
        );
        if (confirmLogin) {
          window.location.href = '/login';
        }
      } else {
        setError(err.message || 'Failed to provide liquidity');
      }
    }
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

      // For parimutuel positions, use withdrawLiquidity (not withdrawLpWinnings)
      if (offer._isParimutuel || userBet._isParimutuel) {
        console.log('[withdrawLiquidityMutation] Parimutuel position - calling withdrawLiquidity');
        const res = await base44.functions.invoke('withdrawLiquidity', {
          userBetId: offer.userBetId
        });
        if (res.data.error) throw new Error(res.data.error);
        return res.data;
      }

      // Traditional LP: check if settled (use withdrawLpWinnings for fee bonus) or open (use withdrawLiquidity)
      const bet = await base44.entities.Bet.get(userBet.bet_id);
      const isSettled = bet?.status === 'settled';

      if (isSettled) {
        console.log('[withdrawLiquidityMutation] Settled LP position - calling withdrawLpWinnings');
        const res = await base44.functions.invoke('withdrawLpWinnings', {
          userBetId: offer.userBetId
        });
        if (res.data.error) throw new Error(res.data.error);
        return res.data;
      } else {
        console.log('[withdrawLiquidityMutation] Open LP position - calling withdrawLiquidity');
        const res = await base44.functions.invoke('withdrawLiquidity', {
          userBetId: offer.userBetId
        });
        if (res.data.error) throw new Error(res.data.error);
        return res.data;
      }
    },
    onSuccess: (data) => {
      console.log('[withdrawLiquidityMutation] Success:', data);
      setPendingTx({
        instruction: data.solana_instruction,
        amount: data.withdrawAmount || data.amount || 0,
        lpFeeBonus: data.lpFeeBonus || 0,
        totalWithdraw: data.totalWithdraw || (data.withdrawAmount || data.amount || 0) + (data.lpFeeBonus || 0),
        type: 'withdraw_liquidity',
        userBetId: data.userBetId,
        offerId: data.offerId
      });
    },
    onError: (err) => {
      console.error('[withdrawLiquidityMutation] Error:', err);
      setError(err.message || 'Failed to withdraw liquidity');
    }
  });

  const handleTxSuccess = async (txResult) => {
    const signature = txResult.signature;
    const committedAmount = pendingTx?.amount || 0;

    console.log('[LpDashboard] handleTxSuccess called with signature:', signature.slice(0, 20) + '...');
    console.log('[LpDashboard] pendingCommitData:', pendingCommitData ? 'exists' : 'null');

    if (pendingCommitData) {
      try {
        console.log('[LpDashboard] Calling commitLiquidity...');
        const commitRes = await base44.functions.invoke('commitLiquidity', {
          signature,
          commit_data: pendingCommitData
        });
        console.log('[LpDashboard] commitLiquidity response:', commitRes.data);
        if (commitRes.data.error) {
          console.error('[LpDashboard] commitLiquidity error:', commitRes.data.error);
          setError('Commit failed: ' + commitRes.data.error);
        } else {
          console.log('[LpDashboard] ✓ Liquidity committed successfully, offerId:', commitRes.data.offerId, 'userBetId:', commitRes.data.userBetId);
        }
      } catch (err) {
        console.error('[LpDashboard] commitLiquidity threw:', err);
        setError('Commit failed: ' + err.message);
      }
      setPendingCommitData(null);
    } else {
      console.error('[LpDashboard] No pendingCommitData available!');
    }

    // Use the outcome from pendingCommitData (which has the actual selected outcome)
    const outcomeLabel = pendingCommitData?.outcome_label || selectedBet?.outcome_a || 'Unknown';
    const matchTitle = pendingCommitData?.match_title || selectedBet ? `${selectedBet.outcome_a} vs ${selectedBet.outcome_b}` : 'Market';

    setSuccessDialog({
      signature,
      amount: committedAmount,
      team: outcomeLabel,
      match: matchTitle
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
          offerId: pendingTx.offerId
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
      lpFeeBonus: pendingTx?.lpFeeBonus || 0,
      totalWithdraw: (pendingTx?.amount || 0) + (pendingTx?.lpFeeBonus || 0)
    });

    setPendingTx(null);
    setError(null);
    // Invalidate queries immediately to remove withdrawn position
    queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['allUserBets', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['offersWithUserBet', walletAddress] });
  };

  // Stats - calculate from UserBet data (works for both traditional LP and parimutuel)
  const totalCommitted = myOffers.reduce((s, o) => {
    return s + (o.userBet?.amount || o.amount_offered || 0);
  }, 0);
  const totalMatched = myOffers.reduce((s, o) => s + (o.amount_matched || 0), 0);
  const totalUnmatched = myOffers.reduce((s, o) => s + (o.amount_unmatched || 0), 0);
  const totalFeesEarned = totalMatched * 0.02; // 2% fee on matched portion
  const activeOffers = myOffers.filter((o) => o.status === 'open' || o.status === 'partially_matched');

  const offersWithUserBet = myOffers;

  const getMatchTitle = (matchId) => {
    const m = matches.find((m) => m.id === matchId);
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

    // Check if user is logged into the platform (base44.auth.me() will fail if not)
    try {
      const currentUser = await base44.auth.me();
      if (!currentUser) {
        throw new Error('Not logged in');
      }
    } catch (authErr) {
      const confirmLogin = confirm(
        '⚠️ You need to log in first!\n\n' +
        'Your wallet is connected, but you need a platform account to provide liquidity.\n\n' +
        'Click OK to go to the login/register page, or Cancel to continue browsing.'
      );
      if (confirmLogin) {
        window.location.href = '/login';
      }
      return;
    }

    try {
      const res = await base44.functions.invoke('provideFuturesLiquidity', {
        walletAddress,
        market_id: outcome.market_id,
        outcome_label: outcome.label,
        outcome_flag: outcome.flag,
        odds: outcome.odds,
        amount
      });

      if (res.data.error) {
        alert('Error: ' + res.data.error);
        return;
      }

      if (res.data.solana_instruction) {
        setPendingFuturesTx({
          instruction: res.data.solana_instruction,
          amount,
          type: 'provide_futures_liquidity'
        });
        setPendingFuturesCommit(res.data.commit_data);
      }
    } catch (error) {
      console.error('[handleFuturesLiquidity] Error:', error);
      alert('Failed to provide liquidity: ' + error.message);
    }
  };

  const handleFuturesTxSuccess = async (txResult) => {
    const signature = txResult.signature;

    if (pendingFuturesCommit) {
      try {
        const commitRes = await base44.functions.invoke('commitFuturesLiquidity', {
          signature,
          commit_data: pendingFuturesCommit
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
      match: 'Tournament Market'
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
      amount: String(amount)
    });
  };

  return (
    <div className="space-y-6">
      <SuccessDialog open={!!successDialog} data={successDialog} onClose={() => setSuccessDialog(null)} />
      <SuccessDialog open={!!withdrawSuccessDialog} data={withdrawSuccessDialog} onClose={() => setWithdrawSuccessDialog(null)} isWithdraw={true} />
      
      {/* Hero Section - Full Width like Matches/Futures */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-8"
        style={{ background: 'linear-gradient(135deg, #1a1040 0%, #0f0a1e 50%, #12102a 100%)' }}>
        
        <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-2.5 sm:px-3 py-1 rounded-full">
              <Trophy className="w-3 h-3 text-primary" />
              <span className="text-[10px] sm:text-[11px] font-bold text-primary tracking-widest">LIQUIDITY PROVIDER</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl leading-tight mb-2 text-white">
                LP Dashboard
              </h1>
              <p className="text-white/50 text-xs sm:text-sm max-w-md mb-4">
                Provide liquidity for matches & futures. Earn fees and back your team.
                {walletAddress && <span className="ml-2 text-[10px] font-mono opacity-50">({walletAddress.slice(0, 6)}...{walletAddress.slice(-4)})</span>}
              </p>
            </div>
            <Button variant="outline" onClick={() => refetchOffers()} className="gap-2 rounded-xl h-10 px-4 text-xs sm:text-sm shrink-0">
              Refresh
            </Button>
          </div>

          {/* How LP Works - Integrated into Hero */}
          <div className="border-t border-white/10 pt-4">
            <div className="inline-flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-2.5 sm:px-3 py-1 rounded-full text-primary text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-3">
              👑 How Liquidity Providing Works
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <span className="text-lg sm:text-xl">🎯</span>
                <h3 className="font-heading font-bold text-[11px] sm:text-xs text-primary">Back Your Team</h3>
                <p className="text-[10px] sm:text-[11px] text-white/60 leading-relaxed">
                  Provide liquidity on outcomes you believe will <strong>WIN</strong>. If it wins, you profit! If it loses, bettors take the pool.
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-lg sm:text-xl">💰</span>
                <h3 className="font-heading font-bold text-[11px] sm:text-xs text-accent">Earn Fees + Winnings</h3>
                <p className="text-[10px] sm:text-[11px] text-white/60 leading-relaxed">
                  Earn <strong>2% fees</strong> on every bet matched against your liquidity, plus keep the pool if your outcome wins!
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-lg sm:text-xl">🔓</span>
                <h3 className="font-heading font-bold text-[11px] sm:text-xs text-yellow-400">Full Control</h3>
                <p className="text-[10px] sm:text-[11px] text-white/60 leading-relaxed">
                  Withdraw unmatched liquidity <strong>instantly anytime</strong>. Only locked when matched. <strong>Instant DB claims</strong> — no on-chain delays.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {!isConnected &&
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/20 p-8 text-center"
        style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}>
        
          <Wallet className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-heading font-black text-xl text-white mb-2">Connect Wallet to Provide Liquidity</h3>
          <p className="text-white/50 text-sm mb-5 max-w-xs mx-auto">Connect Phantom to start providing LP liquidity.</p>
          <Button onClick={connect} className="font-heading font-bold px-8 h-11 rounded-xl text-sm"
        style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
            <Wallet className="w-4 h-4 mr-2" /> Connect Phantom
          </Button>
        </motion.div>
      }

      {isConnected &&
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-6 bg-secondary/30 p-1.5 rounded-xl gap-2 h-auto">
            <TabsTrigger value="matches" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary">
              <TrendingUp className="w-4 h-4 mr-2 text-primary" /> Match LP
            </TabsTrigger>
            <TabsTrigger value="futures" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 data-[state=active]:border-b-2 data-[state=active]:border-yellow-400">
              <Trophy className="w-4 h-4 mr-2 text-yellow-400" /> Futures LP
            </TabsTrigger>
            <TabsTrigger value="positions" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-accent/20 data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent">
              <DollarSign className="w-4 h-4 mr-2 text-accent" /> My LP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
            { label: 'Committed', value: `◎${totalCommitted.toFixed(4)}`, color: 'text-primary' },
            { label: 'Matched', value: `◎${totalMatched.toFixed(4)}`, color: 'text-accent' },
            { label: 'Unmatched', value: `◎${totalUnmatched.toFixed(4)}`, color: 'text-yellow-400' }].
            map((s, i) =>
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-xl p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`font-heading font-bold text-lg ${s.color}`}>{s.value}</p>
                </motion.div>
            )}
            </div>

            {/* Provide liquidity section */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              {error &&
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 mb-4">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <AlertDescription className="text-destructive text-sm">
                    {error}
                    <Button variant="link" className="p-0 h-auto text-destructive underline ml-2" onClick={() => setError(null)}>Dismiss</Button>
                  </AlertDescription>
                </Alert>
            }

              <div className="space-y-4">
                <h2 className="font-heading font-bold text-sm">Provide Liquidity</h2>
                  
                {/* Group Navigation */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <button
                  onClick={() => setActiveGroup('all')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  activeGroup === 'all' ?
                  'bg-primary text-primary-foreground' :
                  'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`
                  }>
                  
                    All Groups
                  </button>
                  {groups.filter((g) => g !== 'all' && g !== 'World Cup 2026').map((group) =>
                <button
                  key={group}
                  onClick={() => setActiveGroup(group)}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  activeGroup === group ?
                  'bg-primary text-primary-foreground' :
                  'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`
                  }>
                  
                      {group}
                    </button>
                )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {(() => {
                  // Deduplicate bets by match_id to prevent showing same match twice
                  const seenMatches = new Set();
                  const uniqueBets = filteredOpenBets.filter((bet) => {
                    if (seenMatches.has(bet.match_id)) {
                      console.log('Removing duplicate bet for match:', bet.match_id, 'bet:', bet.id);
                      return false;
                    }
                    seenMatches.add(bet.match_id);
                    return true;
                  });

                  console.log('[LpDashboard] Unique bets to render:', uniqueBets.length, 'out of', filteredOpenBets.length);

                  return uniqueBets.map((bet) => {
                    const match = matches.find((m) => m.id === bet.match_id);
                    return (
                      <MatchLiquidityCard
                        key={bet.id}
                        bet={bet}
                        match={match}
                        isSelected={selectedBet?.id === bet.id}
                        onClick={() => {
                          setSelectedBetForDetail({ bet, match });
                          setDetailModalOpen(true);
                        }} />);


                  });
                })()}
                </div>
              </div>
            </motion.div>


          </TabsContent>

          <TabsContent value="futures" className="space-y-6">
            {pendingFuturesTx &&
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
                  }} />
                
                    <Button variant="outline" size="sm" onClick={() => setPendingFuturesTx(null)} className="w-full">
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
          }
            <FuturesLpPanel
            futuresMarkets={futuresMarkets}
            onProvideLiquidity={handleFuturesLiquidity}
            isConnected={isConnected}
            connect={connect} />
          
          </TabsContent>

          <TabsContent value="positions" className="space-y-4 sm:space-y-6">
            {/* Debug: Show raw data */}
            









          
            








          
            


















          

            {/* My LP Positions Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
              {[
            { label: 'Committed', value: `◎${totalCommitted.toFixed(4)}`, icon: DollarSign, color: 'text-primary' },
            { label: 'Matched', value: `◎${totalMatched.toFixed(4)}`, icon: CheckCircle2, color: 'text-accent' },
            { label: 'Unmatched', value: `◎${totalUnmatched.toFixed(4)}`, icon: Clock, color: 'text-yellow-400' },
            { label: 'Fees Earned', value: `◎${totalFeesEarned.toFixed(4)}`, icon: TrendingUp, color: 'text-accent' },
            { label: 'Active', value: activeOffers.length.toString(), icon: TrendingUp, color: 'text-chart-2' }].
            map((s, i) =>
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <s.icon className={`w-3 h-3 sm:w-4 sm:h-4 ${s.color}`} />
                    <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  </div>
                  <p className={`font-heading font-bold text-base sm:text-lg ${s.color}`}>{s.value}</p>
                </motion.div>
            )}
            </div>

            {/* LP Positions List */}
            <div className="space-y-3">
              <h2 className="font-heading font-bold text-sm text-muted-foreground">Your LP Positions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {(() => {
                console.log('=== RENDER DEBUG ===');
                console.log('offersWithUserBet:', offersWithUserBet);
                console.log('Length:', offersWithUserBet.length);

                if (offersWithUserBet.length === 0) {
                  console.log('No offers to render');
                  return (
                    <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
                        <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="font-heading font-bold text-sm text-muted-foreground mb-1">No LP positions yet</p>
                        <p className="text-xs text-muted-foreground">Check browser console for debug info</p>
                      </div>);

                }

                console.log('Mapping', offersWithUserBet.length, 'offers...');

                return offersWithUserBet.map((offer, idx) => {
                  console.log(`Rendering offer ${idx}:`, offer.id, offer.outcome_label, offer.status, 'userBetId:', offer.userBetId);
                  try {
                    const match = matches.find((m) => m.id === offer.match_id);
                    console.log(`Offer ${idx} match:`, match?.team_a, 'vs', match?.team_b, 'match_id:', offer.match_id);

                    return (
                      <LpPositionCard
                        key={offer.id || offer.userBetId}
                        position={{ ...offer, userBetId: offer.userBetId || offer.id }}
                        match={match}
                        walletAddress={walletAddress}
                        onWithdrawRequest={(withdrawData) => {
                          console.log('[onWithdrawRequest] Withdraw triggered:', withdrawData);
                          console.log('[onWithdrawRequest] Solana instruction:', withdrawData.solanaInstruction);
                          if (!withdrawData.solanaInstruction) {
                            console.error('[onWithdrawRequest] Missing solanaInstruction in withdrawData:', withdrawData);
                            alert('Error: No instruction received from backend');
                            return;
                          }
                          setPendingTx({
                            instruction: withdrawData.solanaInstruction,
                            amount: withdrawData.withdrawAmount || 0,
                            type: 'withdraw_liquidity',
                            userBetId: withdrawData.positionId,
                            offerId: withdrawData.offerId
                          });
                        }} />);

                  } catch (err) {
                    console.error(`Error rendering offer ${idx}:`, err);
                    return null;
                  }
                });
              })()}
              </div>
            </div>

            {/* Withdraw Transaction Signer */}
            {pendingTx && pendingTx.type === 'withdraw_liquidity' &&
          <SolanaTransactionSigner
            instruction={pendingTx.instruction}
            amount={pendingTx.amount}
            onSuccess={handleWithdrawSuccess}
            onError={() => setPendingTx(null)} />

          }
          </TabsContent>
        </Tabs>
      }

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
        }} />
      

      {/* Transaction Modal Overlay */}
      {pendingTx && pendingTx.type === 'provide_liquidity' &&
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
              onError={handleTxError} />
            
              <Button variant="outline" size="sm" onClick={() => setPendingTx(null)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      }
    </div>);

}