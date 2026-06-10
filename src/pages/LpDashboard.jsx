import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, Clock, CheckCircle2, AlertCircle, Trophy, ChevronDown, ChevronUp, Target, Coins, Lock, Bug, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import FuturesLpPanel from '@/components/lp/FuturesLpPanel';
import MatchLiquidityCard from '@/components/lp/MatchLiquidityCard';
import LiquidityDetailModal from '@/components/lp/LiquidityDetailModal';
import LpPositionCard from '@/components/lp/LpPositionCard';
import LpStatsHeader from '@/components/lp/LpStatsHeader';
import { getWalletFromAuth } from '@/utils/auth';



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

  const [activeTab, setActiveTab] = useState('stats');
  const [selectedBet, setSelectedBet] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('a');
  const [amount, setAmount] = useState('');
  const [pendingTx, setPendingTx] = useState(null);

  const [error, setError] = useState(null);
  const [activeGroup, setActiveGroup] = useState('all');
  const [matchViewMode, setMatchViewMode] = useState('today'); // Default to today
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedBetForDetail, setSelectedBetForDetail] = useState(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);

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
          const isFutures = ub._isFutures || ub.match_id && ub.match_id === ub.bet_id;
          offer = {
            id: ub.offer_id || ub.id,
            bet_id: ub.bet_id,
            match_id: ub.match_id,
            outcome: ub.outcome,
            outcome_label: ub.outcome_label,
            // CRITICAL: For futures, use liquidity_* fields; for matches, use amount
            amount_offered: isFutures ? ub.liquidity_deposited || ub.amount : ub.amount_offered || ub.amount,
            amount_matched: isFutures ? ub.liquidity_matched || 0 : ub.amount_matched || ub.liquidity_matched || 0,
            amount_unmatched: isFutures ? ub.liquidity_unmatched || ub.amount : ub.amount_unmatched || ub.liquidity_unmatched || ub.amount,
            status: ub.status === 'active' ? 'open' : ub.status,
            odds_at_creation: ub.amount > 0 ? ub.potential_payout / ub.amount : 2.0,
            lp_wallet_address: ub.wallet_address,
            _isFutures: isFutures
          };
          console.log('Built fallback offer from UserBet:', offer);
        }

        // Ensure _isFutures is set on offer from BetOffer
        if (offer && !offer._isFutures && ub._isFutures) {
          offer._isFutures = true;
        }

        return { ...offer, userBetId: ub.id, userBet: ub, userBetStatus: ub.status };
      }));

      const result = offersWithDetails.filter((o) => o !== null);
      console.log('[LpDashboard] Final offers with userBetStatus:', result.map(o => ({ id: o.id, userBetId: o.userBetId, status: o.status, userBetStatus: o.userBetStatus })));

      // Step 3: GROUP multiple transactions for the same position (same match_id + outcome for matches, same market_id + outcome for futures)
      console.log('Step 3: Grouping multiple transactions for same positions...');
      const groupedMap = new Map();
      
      result.forEach((offer) => {
        // Create grouping key based on market type
        const isFutures = offer._isFutures || offer.match_id === offer.bet_id;
        const groupKey = isFutures 
          ? `futures_${offer.bet_id}_${offer.outcome}` // For futures: market_id + outcome
          : `match_${offer.match_id}_${offer.outcome}`; // For matches: match_id + outcome
        
        if (!groupedMap.has(groupKey)) {
          groupedMap.set(groupKey, {
            ...offer,
            _isFutures: isFutures,
            _groupedTransactions: [offer],
            total_liquidity_deposited: offer.userBet?.liquidity_deposited || offer.amount_offered || 0,
            total_liquidity_matched: offer.amount_matched || 0,
            total_liquidity_unmatched: offer.amount_unmatched || 0,
            userBetStatus: offer.userBetStatus || offer.userBet?.status,
          });
        } else {
          // Group this transaction with existing position
          const existing = groupedMap.get(groupKey);
          existing._groupedTransactions.push(offer);
          existing.total_liquidity_deposited += offer.userBet?.liquidity_deposited || offer.amount_offered || 0;
          existing.total_liquidity_matched += offer.amount_matched || 0;
          existing.total_liquidity_unmatched += offer.amount_unmatched || 0;
          
          // Use the earliest created_date for the group
          if (offer.userBet?.created_date < existing.userBet?.created_date) {
            existing.userBet = offer.userBet;
            existing.userBetStatus = offer.userBetStatus || offer.userBet?.status;
          }
          
          // If this transaction has a claimed status, prioritize it
          if (offer.userBetStatus === 'claimed') {
            existing.userBetStatus = 'claimed';
          }
        }
      });
      
      const groupedResult = Array.from(groupedMap.values());
      console.log('Grouped LP positions:', groupedResult.length, '(from', result.length, 'raw transactions)');
      console.log('==================');
      return groupedResult;
    },
    enabled: !!walletAddress,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 30000
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list()
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['bets'],
    queryFn: () => base44.entities.Bet.list()
  });

  // Extract unique groups from ALL matches (not just open bets), plus all World Cup groups A-L
  const groupSet = new Set(matches.map((m) => m.group_stage).filter(Boolean));

  // Ensure all World Cup groups A-L are included
  const allWorldCupGroups = ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F', 'Group G', 'Group H', 'Group I', 'Group J', 'Group K', 'Group L'];
  allWorldCupGroups.forEach((g) => groupSet.add(g));

  const groups = ['all', ...Array.from(groupSet).sort()];

  // Filter open bets by active group and view mode (today/all)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const filteredOpenBets = openBets.filter((bet) => {
    const match = matches.find((m) => m.id === bet.match_id);
    if (!match) return false;

    // Filter by group
    if (activeGroup !== 'all') {
      if (!match.group_stage || match.group_stage !== activeGroup) return false;
    }

    // Filter by view mode (today vs all)
    if (matchViewMode === 'today') {
      const matchDate = new Date(match.match_time);
      if (matchDate < today || matchDate >= tomorrow) return false;
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
      // Close detail modal to reveal the signing modal
      setDetailModalOpen(false);
    },
    onError: (err) => {
      console.error('[provideLiquidity] Error:', err);
      // Close detail modal so user can see the error
      setDetailModalOpen(false);
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
      let errorMsg = err.message || 'Failed to withdraw liquidity';

      // Handle auto-voided market error
      if (err.message?.includes('auto-voided') || err.message?.includes('no bets on winning outcome')) {
        errorMsg = '⚠️ Market Auto-Voided\n\nNo one bet on the winning outcome, so the market was automatically voided.\n\nYour unmatched liquidity can still be withdrawn - use "Withdraw Unmatched" instead.';
      }

      setError(errorMsg);
    }
  });

  const handleTxSuccess = async (txResult) => {
    const signature = txResult.signature;

    if (pendingCommitData) {
      try {
        const commitRes = await base44.functions.invoke('commitLiquidity', {
          signature,
          commit_data: pendingCommitData
        });
        if (commitRes.data.error) {
          setError('Commit failed: ' + commitRes.data.error);
        }
      } catch (err) {
        setError('Commit failed: ' + err.message);
      }
      setPendingCommitData(null);
    }

    // Small delay so SolanaTransactionSigner can show its success state, then close
    setTimeout(async () => {
      setPendingTx(null);
      setAmount('');
      setSelectedBet(null);
      setModalTransactionMode(false);
      setDetailModalOpen(false);
      setError(null);
      // Only refetch myOffers - don't invalidate everything (causes jarring refresh)
      await refetchOffers();
    }, 2500);
  };

  const handleTxError = (err) => {
    setPendingTx(null);
    setModalTransactionMode(false);
  };

  const handleWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    const userBetId = pendingTx?.userBetId;
    const offerId = pendingTx?.offerId;
    // Notify card to refetch on-chain state so withdraw button disappears immediately
    pendingTx?.onSuccess?.();

    console.log('[LpDashboard] handleWithdrawSuccess - finalizing withdrawal:', { userBetId, offerId, signature });

    if (userBetId) {
      try {
        const finalizeRes = await base44.functions.invoke('finalizeWithdrawal', {
          signature,
          userBetId,
          offerId: offerId || null
        });
        console.log('[LpDashboard] finalizeWithdrawal response:', finalizeRes);
      } catch (err) {
        console.error('[LpDashboard] finalizeWithdrawal threw:', err);
      }
    }

    // Small delay so SolanaTransactionSigner can show its success state, then close
    setTimeout(async () => {
      console.log('[LpDashboard] Invalidating queries to refresh claimed status...');
      setPendingTx(null);
      setError(null);
      // CRITICAL: Force refetch by using refetch instead of just invalidate
      await refetchOffers();
      // Also invalidate to ensure cache is cleared
      await queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['openBets'] });
      await queryClient.invalidateQueries({ queryKey: ['userBets'], refetchType: 'active' });
      console.log('[LpDashboard] Queries invalidated and refetched');
    }, 1500);
  };

  // Stats - calculate from UserBet data (works for both traditional LP and parimutuel)
  const totalCommitted = myOffers.reduce((s, o) => {
    return s + (o.userBet?.amount || o.amount_offered || 0);
  }, 0);
  const totalMatched = myOffers.reduce((s, o) => s + (o.amount_matched || 0), 0);
  const totalUnmatched = myOffers.reduce((s, o) => s + (o.amount_unmatched || 0), 0);
  const totalFeesEarned = totalMatched * 0.02; // 2% fee on matched portion
  const totalClaimed = myOffers.filter((o) => o.status === 'claimed' || o.userBet?.status === 'claimed').reduce((s, o) => s + (o.userBet?.actual_payout || o.amount_matched || 0), 0);
  const activeOffers = myOffers.filter((o) => o.status === 'open' || o.status === 'partially_matched');

  const offersWithUserBet = myOffers;
  
  // Separate Match LP and Futures LP
  const matchLpPositions = myOffers.filter((o) => !o._isFutures);
  const futuresLpPositions = myOffers.filter((o) => o._isFutures);

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
  
  // Fetch on-chain lp_offer data for futures markets - ONE CARD PER OUTCOME (0,1,2)
  const { data: onChainFuturesLpOffers = {} } = useQuery({
    queryKey: ['onchain-futures-lp-offers', walletAddress, futuresMarkets.length],
    queryFn: async () => {
      if (!walletAddress || futuresMarkets.length === 0) return {};
      
      console.log('[LpDashboard] === FETCHING ON-CHAIN FUTURES LP OFFERS ===');
      const result = {};
      
      // For each futures market, derive and fetch lp_offer PDAs for outcomes 0, 1, 2
      for (const market of futuresMarkets) {
        const marketPda = market.solana_market_pda;
        if (!marketPda) {
          console.log('[LpDashboard] Skipping market', market.id, '- no solana_market_pda');
          continue;
        }
        
        console.log('[LpDashboard] Market:', market.id, 'solana_market_pda:', marketPda);
        const marketOffers = [];
        
        // Derive PDA for each outcome: seeds ["lp_offer", marketPda, lpWallet, [outcome]]
        for (let outcome = 0; outcome < 3; outcome++) {
          try {
            // Derive PDA
            const deriveRes = await base44.functions.invoke('deriveLpOfferPda', {
              market_pda: marketPda,
              lp_wallet: walletAddress,
              outcome,
            });
            
            const pda = deriveRes.data?.pda;
            if (!pda) {
              console.log('[LpDashboard] No PDA derived for outcome', outcome);
              continue;
            }
            
            console.log('[LpDashboard] Outcome', outcome, '→ PDA:', pda);
            
            // Fetch on-chain account data directly
            const chainData = await base44.functions.invoke('fetchLpOfferOnChain', {
              pda,
            });
            
            if (chainData.data && chainData.data.exists && !chainData.error) {
              console.log('[LpDashboard] ✓ On-chain data for outcome', outcome, ':', chainData.data);
              marketOffers.push({
                outcome,
                pda,
                amountCommitted: chainData.data.amountCommitted,
                amountMatched: chainData.data.amountMatched,
                available: chainData.data.available,
                closed: chainData.data.closed,
              });
            } else {
              console.log('[LpDashboard] ✗ No data for outcome', outcome, '- error:', chainData.error);
            }
          } catch (err) {
            console.error('[LpDashboard] Error fetching outcome', outcome, ':', err.message);
          }
        }
        
        if (marketOffers.length > 0) {
          console.log('[LpDashboard] Market', market.id, 'has', marketOffers.length, 'offers:', marketOffers);
          result[market.id] = marketOffers;
        }
      }
      
      console.log('[LpDashboard] === FINAL RESULT ===');
      console.log('[LpDashboard] Total markets with offers:', Object.keys(result).length);
      console.log('[LpDashboard] Result:', result);
      return result;
    },
    enabled: !!walletAddress && futuresMarkets.length > 0,
    staleTime: 3000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

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

    // Small delay so SolanaTransactionSigner can show its success state, then close
    setTimeout(() => {
      setPendingFuturesTx(null);
      queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
    }, 2500);
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

      
      {/* Hero Section - Full Width like Matches/Futures */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border/50 bg-card">
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                <Trophy className="w-3 h-3 text-primary" />
                <span className="text-[9px] sm:text-[10px] font-bold text-primary tracking-widest">LIQUIDITY PROVIDER</span>
              </div>
            </div>
            {/* Mobile Expand/Collapse Button */}
            <button
              onClick={() => setIsInfoExpanded(!isInfoExpanded)}
              className="sm:hidden flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
              
              {isInfoExpanded ?
              <>
                  <span>Hide</span>
                  <ChevronUp className="w-3 h-3" />
                </> :

              <>
                  <span>Info</span>
                  <ChevronDown className="w-3 h-3" />
                </>
              }
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-heading font-black text-xl sm:text-2xl md:text-3xl leading-tight mb-2">
                LP Dashboard
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                Provide liquidity for matches & futures. Earn fees and back your team.
                {walletAddress && <span className="ml-2 text-[10px] font-mono text-muted-foreground/50">({walletAddress.slice(0, 6)}...{walletAddress.slice(-4)})</span>}
              </p>
            </div>
            

            
          </div>

          {/* How LP Works - Expandable on mobile */}
          <div className={`overflow-hidden transition-all duration-300 ${isInfoExpanded ? 'max-h-[800px]' : 'max-h-[0px]'} sm:max-h-none`}>
            <div className="border-t border-border/50 pt-4">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-3">
                <Target className="w-3 h-3" /> How Liquidity Providing Works
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Target className="w-6 h-6 text-primary" />
                  <h3 className="font-heading font-bold text-[11px] sm:text-xs text-primary">LP on the Loser</h3>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    Provide liquidity on outcomes you believe will <strong>LOSE</strong>. When bettors lose, you keep their stake + earn fees!
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Coins className="w-6 h-6 text-accent" />
                  <h3 className="font-heading font-bold text-[11px] sm:text-xs text-accent">Earn 2% Fees Always</h3>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    Every bet matched against your LP charges <strong>2% fees</strong> — paid to you regardless of outcome. Pure passive income.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Lock className="w-6 h-6 text-yellow-400" />
                  <h3 className="font-heading font-bold text-[11px] sm:text-xs text-yellow-400">Full Control</h3>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    Withdraw unmatched liquidity <strong>instantly anytime</strong>. Only locked when matched. <strong>Instant on-chain claims</strong> — direct to your wallet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Close the expandable div */}
      {!isConnected &&
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/50 p-8 text-center bg-card">
        
          <Wallet className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-heading font-black text-xl mb-2">Connect Wallet to Provide Liquidity</h3>
          <p className="text-muted-foreground text-sm mb-5 max-w-xs mx-auto">Connect Phantom to start providing LP liquidity.</p>
          <Button onClick={connect} className="font-heading font-bold px-8 h-11 rounded-xl text-sm"
        style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
            <Wallet className="w-4 h-4 mr-2" /> Connect Phantom
          </Button>
        </motion.div>
      }

      {isConnected &&
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-4 mb-6 bg-secondary/30 p-1.5 rounded-xl gap-1 h-auto">
            <TabsTrigger value="stats" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs sm:text-sm">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Stats
            </TabsTrigger>
            <TabsTrigger value="matches" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary text-xs sm:text-sm">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Match LP
            </TabsTrigger>
            <TabsTrigger value="futures" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 data-[state=active]:border-b-2 data-[state=active]:border-yellow-400 text-xs sm:text-sm">
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Futures LP
            </TabsTrigger>
            <TabsTrigger value="positions" className="font-heading font-bold flex items-center justify-center py-2.5 rounded-lg transition-all data-[state=active]:bg-accent/20 data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent text-xs sm:text-sm">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> My LP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4">
            <LpStatsHeader lpPositions={myOffers} />
            {myOffers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No LP positions yet. Start by providing liquidity in Match LP or Futures LP tabs.
              </div>
            )}
          </TabsContent>

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
                  
                {/* View Mode Toggle (Today / All) */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setMatchViewMode('today')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      matchViewMode === 'today'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setMatchViewMode('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      matchViewMode === 'all'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    All Matches
                  </button>
                </div>

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
                  {groups.filter((g) => g !== 'all' && g !== 'World Cup 2026').map((group) => (
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
              {[
            { label: 'Committed', value: `◎${totalCommitted.toFixed(4)}`, icon: DollarSign, color: 'text-primary' },
            { label: 'Matched', value: `◎${totalMatched.toFixed(4)}`, icon: CheckCircle2, color: 'text-accent' },
            { label: 'Unmatched', value: `◎${totalUnmatched.toFixed(4)}`, icon: Clock, color: 'text-yellow-400' },
            { label: 'Fees Earned', value: `◎${totalFeesEarned.toFixed(4)}`, icon: TrendingUp, color: 'text-accent' },
            { label: 'Total Claimed', value: `◎${totalClaimed.toFixed(4)}`, icon: CheckCircle, color: 'text-accent' },
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

            {/* LP Positions List - Separated into Match LP and Futures LP */}
            <div className="space-y-6">
              {/* Match LP Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="font-heading font-bold text-base">Match LP</h2>
                  <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold">
                    {matchLpPositions.length}
                  </Badge>
                </div>
                {matchLpPositions.length === 0 ? (
                  <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
                    <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-heading font-bold text-sm text-muted-foreground mb-1">No Match LP positions yet</p>
                    <p className="text-xs text-muted-foreground">Provide liquidity for matches in the Match LP tab</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {matchLpPositions.map((offer, idx) => {
                      const match = matches.find((m) => m.id === offer.match_id);
                      const bet = bets.find((b) => b.id === offer.bet_id || b.match_id === offer.match_id);
                      console.log('[LpDashboard] Rendering Match LP position:', {
                        offer_id: offer.id,
                        userBetId: offer.userBetId,
                        offer_status: offer.status,
                        userBetStatus: offer.userBetStatus,
                        userBet_status: offer.userBet?.status,
                        bet_id: bet?.id,
                        bet_winning_outcome: bet?.winning_outcome,
                        match_winner: match?.winner,
                        final_position_status: { ...offer, userBetId: offer.userBetId || offer.id }.status,
                        final_position_userBetStatus: { ...offer, userBetId: offer.userBetId || offer.id }.userBetStatus
                      });
                      return (
                        <LpPositionCard
                          key={`match-${offer.id || offer.userBetId}`}
                          position={{ ...offer, userBetId: offer.userBetId || offer.id, bet_winning_outcome: bet?.winning_outcome || match?.winner || '' }}
                          match={match}
                          bet={bet}
                          walletAddress={walletAddress}
                          onWithdrawRequest={(withdrawData) => {
                            setPendingTx({
                              instruction: withdrawData.solanaInstruction,
                              amount: withdrawData.withdrawAmount || 0,
                              type: 'withdraw_liquidity',
                              userBetId: withdrawData.positionId,
                              offerId: withdrawData.offerId,
                              onSuccess: withdrawData.onSuccess,
                            });
                          }} />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Futures LP Section - Show ONE card per ON-CHAIN lp_offer */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <h2 className="font-heading font-bold text-base">Futures LP</h2>
                  <Badge className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-bold">
                    {Object.values(onChainFuturesLpOffers).flat().length || futuresLpPositions.length}
                  </Badge>
                </div>
                {Object.keys(onChainFuturesLpOffers).length === 0 && futuresLpPositions.length === 0 ? (
                  <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
                    <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-heading font-bold text-sm text-muted-foreground mb-1">No Futures LP positions yet</p>
                    <p className="text-xs text-muted-foreground">Provide liquidity for futures markets in the Futures LP tab</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {/* Render cards from ON-CHAIN data - ONE card per lp_offer */}
                    {Object.entries(onChainFuturesLpOffers).flatMap(([marketId, offers]) => {
                      const futuresMarket = futuresMarkets.find((fm) => fm.id === marketId);
                      if (!futuresMarket) return [];
                      
                      return offers.map((chainOffer) => {
                        // Get outcome label from market outcomes array
                        const outcomeData = futuresMarket.outcomes?.[chainOffer.outcome];
                        const outcomeLabel = outcomeData?.label || `Outcome ${chainOffer.outcome + 1}`;
                        
                        // Build position object from on-chain data
                        const position = {
                          id: `onchain-${chainOffer.pda}`,
                          bet_id: marketId,
                          match_id: marketId,
                          outcome: chainOffer.outcome === 0 ? 'a' : chainOffer.outcome === 1 ? 'b' : 'draw',
                          outcome_label: outcomeLabel,
                          outcome_num: chainOffer.outcome,
                          liquidity_deposited: chainOffer.amountCommitted,
                          liquidity_matched: chainOffer.amountMatched,
                          liquidity_unmatched: chainOffer.available,
                          status: chainOffer.closed ? 'withdrawn' : 'open',
                          wallet_address: walletAddress,
                          solana_market_pda: futuresMarket.solana_market_pda,
                          solana_position_pda: chainOffer.pda,
                          _isFutures: true,
                          userBetId: null,
                          userBetStatus: chainOffer.closed ? 'withdrawn' : 'active',
                        };
                        
                        console.log('[LpDashboard] Rendering on-chain futures LP:', {
                          market: marketId,
                          outcome: chainOffer.outcome,
                          label: outcomeLabel,
                          committed: chainOffer.amountCommitted,
                          matched: chainOffer.amountMatched,
                          available: chainOffer.available,
                          closed: chainOffer.closed,
                          pda: chainOffer.pda,
                        });
                        
                        return (
                          <LpPositionCard
                            key={`futures-onchain-${chainOffer.pda}`}
                            position={position}
                            match={null}
                            bet={futuresMarket}
                            walletAddress={walletAddress}
                            onWithdrawRequest={(withdrawData) => {
                              setPendingTx({
                                instruction: withdrawData.solanaInstruction,
                                amount: withdrawData.withdrawAmount || 0,
                                type: 'withdraw_liquidity',
                                userBetId: withdrawData.positionId,
                                offerId: withdrawData.offerId,
                                onSuccess: withdrawData.onSuccess,
                              });
                            }} />
                        );
                      });
                    })}
                    
                    {/* Fallback to DB data if on-chain fetch failed or empty */}
                    {Object.keys(onChainFuturesLpOffers).length === 0 && futuresLpPositions.map((offer, idx) => {
                      const futuresMarket = futuresMarkets.find((fm) => fm.id === offer.bet_id);
                      return (
                        <LpPositionCard
                          key={`futures-db-${offer.id || offer.userBetId}`}
                          position={{ 
                            ...offer, 
                            userBetId: offer.userBetId || offer.id,
                            solana_market_pda: futuresMarket?.solana_market_pda || offer.solana_market_pda,
                          }}
                          match={null}
                          bet={futuresMarket}
                          walletAddress={walletAddress}
                          onWithdrawRequest={(withdrawData) => {
                            setPendingTx({
                              instruction: withdrawData.solanaInstruction,
                              amount: withdrawData.withdrawAmount || 0,
                              type: 'withdraw_liquidity',
                              userBetId: withdrawData.positionId,
                              offerId: withdrawData.offerId,
                              onSuccess: withdrawData.onSuccess,
                            });
                          }} />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Withdraw Transaction Signer - Centered Modal */}
            {pendingTx && pendingTx.type === 'withdraw_liquidity' &&
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-card border border-border/50 rounded-2xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto">
                  <div className="space-y-3">
                    <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 text-center">
                      <p className="text-sm font-bold text-accent mb-0.5">Withdraw LP Winnings</p>
                      <p className="text-xs text-muted-foreground">◎{pendingTx.amount.toFixed(4)} SOL</p>
                    </div>
                    <SolanaTransactionSigner
                  instruction={pendingTx.instruction}
                  amount={pendingTx.amount}
                  onSuccess={handleWithdrawSuccess}
                  onError={() => setPendingTx(null)}
                  userBetId={pendingTx.userBetId}
                  offerId={pendingTx.offerId} />
                
                    <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingTx(null)}
                  className="w-full h-9 text-xs rounded-xl border-border/50">
                  
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
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
          <div className="bg-card border border-border/50 rounded-2xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto">
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