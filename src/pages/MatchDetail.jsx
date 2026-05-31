import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { ArrowLeft, Clock, Trophy, TrendingUp, Users, Zap, CheckCircle2, XCircle, Plus, Info, ChevronDown, ChevronUp, Wallet, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

function totalAvailable(offers, outcome) {
  return offers
    .filter(o => o.outcome === outcome && (o.status === 'open' || o.status === 'partially_matched' || o.status === 'pending'))
    .reduce((s, o) => s + (o.amount_unmatched || 0), 0);
}

function calcOdds(avA, avB, avDraw) {
  const oddsA = avA > 0 && (avB + avDraw) > 0 ? (avB + avDraw) / avA : null;
  const oddsB = avB > 0 && (avA + avDraw) > 0 ? (avA + avDraw) / avB : null;
  const oddsDraw = avDraw > 0 && (avA + avB) > 0 ? (avA + avB) / avDraw : null;
  return { oddsA, oddsB, oddsDraw };
}

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1];
const FEE_BPS = 0; // 0% fee - fully decentralized, can be updated later

export default function MatchDetail() {
  const { matchId } = useParams();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState(null); // null | 'offer' | 'match'
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [amount, setAmount] = useState('');
  const [matchingOffer, setMatchingOffer] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const { isConnected, isConnecting, connect } = useWallet();

  const { data: match } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => base44.entities.Match.list().then(ms => ms.find(m => m.id === matchId)),
    enabled: !!matchId,
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['betsForMatch', matchId],
    queryFn: () => base44.entities.Bet.filter({ match_id: matchId }),
    enabled: !!matchId,
  });
  const bet = bets[0] || null;

  const { data: offers = [] } = useQuery({
    queryKey: ['offersForBet', bet?.id],
    queryFn: () => base44.entities.BetOffer.filter({ bet_id: bet.id }),
    enabled: !!bet?.id,
    refetchInterval: 10000,
  });

  const { data: myUserBets = [] } = useQuery({
    queryKey: ['myUserBets', matchId, user?.id],
    queryFn: () => base44.entities.UserBet.filter({ match_id: matchId }),
    enabled: !!matchId && !!user,
  });
  const myActiveBets = myUserBets.filter(ub => ub.created_by_id === user?.id);

  const { data: allUserBets = [] } = useQuery({
    queryKey: ['allUserBetsForBet', bet?.id],
    queryFn: () => base44.entities.UserBet.filter({ bet_id: bet.id }),
    enabled: !!bet?.id,
  });

  const createMarketMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Bet.create({
        match_id: matchId,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        outcome_draw: 'Draw',
        status: 'open',
        lp_amount_a: 0, lp_amount_b: 0, lp_amount_draw: 0,
        backed_amount_a: 0, backed_amount_b: 0, backed_amount_draw: 0,
        total_pool: 0, total_bettors: 0, fee_percent: FEE_BPS,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] }),
  });

  const openOfferMutation = useMutation({
    mutationFn: async ({ outcome, offerOutcomeLabel, offerAmount }) => {
      // Get wallet address from multiple sources for reliability
      const walletSession = localStorage.getItem('elevenx_wallet_session');
      let walletAddress = user?.wallet_address || user?.data?.wallet_address;
      
      // Fallback to localStorage if user object doesn't have it
      if (!walletAddress && walletSession) {
        try {
          const parsed = JSON.parse(walletSession);
          walletAddress = parsed.address || walletSession;
        } catch {
          walletAddress = walletSession;
        }
      }
      
      console.log('🎯 createBetOffer - walletAddress:', walletAddress, 'user:', user);
      
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      const payload = {
        bet_id: bet.id,
        match_id: matchId,
        outcome,
        amount: offerAmount,
        walletAddress,
      };
      
      const response = await base44.functions.invoke('createBetOffer', payload);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      if (!response.data.solana_instruction) {
        throw new Error('No solana_instruction returned');
      }
      
      return { 
        response, 
        amount: offerAmount,
        userBetId: response.data.userBetId 
      };
    },
    onSuccess: async (result) => {
      if (result.response.data.solana_instruction) {
        setPendingTransaction({
          instruction: result.response.data.solana_instruction,
          amount: result.amount,
          userBetId: result.userBetId,
          isOffer: true,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['offersForBet', bet?.id] });
        queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
        queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
        resetForm();
      }
    },
    onError: (error) => {
      console.error('openOfferMutation error:', error);
      console.error('Error response:', error.response?.data);
      const backendError = error.response?.data?.error || error.message || 'Unknown error';
      alert('Failed to create offer: ' + backendError);
    },
  });

  const matchOfferMutation = useMutation({
    mutationFn: async ({ offer, matchAmount }) => {
      // Get wallet address from multiple sources for reliability
      const walletSession = localStorage.getItem('elevenx_wallet_session');
      let walletAddress = user?.wallet_address || user?.data?.wallet_address;
      
      // Fallback to localStorage if user object doesn't have it
      if (!walletAddress && walletSession) {
        try {
          const parsed = JSON.parse(walletSession);
          walletAddress = parsed.address || walletSession;
        } catch {
          walletAddress = walletSession;
        }
      }
      
      console.log('🎯 matchBet - walletAddress:', walletAddress, 'user:', user);
      
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      
      const payload = {
        offer_id: offer.id,
        bet_id: bet.id,
        match_id: matchId,
        amount: matchAmount,
        walletAddress,
      };
      
      const response = await base44.functions.invoke('matchBet', payload);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      if (!response.data.solana_instruction) {
        throw new Error('No solana_instruction returned');
      }
      
      return { 
        response, 
        offer, 
        amount: matchAmount,
        userBetId: response.data.userBetId,
        offerId: response.data.offerId 
      };
    },
    onSuccess: async (result) => {
      console.log('onSuccess called', result);
      if (result.response.data.solana_instruction) {
        setPendingTransaction({
          instruction: result.response.data.solana_instruction,
          amount: result.amount,
          userBetId: result.userBetId,
          offerId: result.offerId,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['offersForBet', bet?.id] });
        queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
        queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ['allUserBetsForBet', bet?.id] });
        resetForm();
      }
    },
    onError: (error) => {
      console.error('matchOfferMutation error:', error);
      console.error('Error response:', error.response?.data);
      const backendError = error.response?.data?.error || error.message || 'Unknown error';
      alert('Failed to place bet: ' + backendError);
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (ubId) => {
      await base44.entities.UserBet.update(ubId, { status: 'claimed' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] }),
  });

  const cancelOfferMutation = useMutation({
    mutationFn: async (ub) => {
      await base44.entities.UserBet.update(ub.id, { status: 'refunded' });
      if (ub.offer_id || ub.role === 'lp') {
        const lpOffers = await base44.entities.BetOffer.filter({ bet_id: ub.bet_id, outcome: ub.outcome });
        const myOffer = lpOffers.find(o => o.created_by_id === user?.id && (o.status === 'open' || o.status === 'partially_matched'));
        if (myOffer) {
          await base44.entities.BetOffer.update(myOffer.id, { status: 'cancelled' });
          const lpField = ub.outcome === 'a' ? 'lp_amount_a' : ub.outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
          await base44.entities.Bet.update(ub.bet_id, {
            [lpField]: Math.max(0, (bet[lpField] || 0) - myOffer.amount_unmatched),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['offersForBet', bet?.id] });
      queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
    },
  });

  function resetForm() {
    setMode(null); setSelectedOutcome(null); setAmount(''); setMatchingOffer(null);
    setPendingTransaction(null);
  }

  const handleTransactionSuccess = async (txResult) => {
    console.log('Transaction confirmed:', txResult);
    
    if (pendingTransaction?.userBetId) {
      try {
        if (pendingTransaction.isOffer) {
          // Update the offer status to open
          await base44.entities.BetOffer.update(pendingTransaction.offerId, {
            status: 'open'
          });
          // Update the UserBet to active
          await base44.entities.UserBet.update(pendingTransaction.userBetId, { 
            status: 'active',
            transaction_signature: txResult?.signature 
          });
          // Update the Bet LP amount
          const ub = await base44.entities.UserBet.get(pendingTransaction.userBetId);
          const lpField = ub.outcome === 'a' ? 'lp_amount_a' : ub.outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
          await base44.entities.Bet.update(ub.bet_id, {
            [lpField]: (bet[lpField] || 0) + ub.amount,
          });
        } else {
          // Update the offer amounts
          const ub = await base44.entities.UserBet.get(pendingTransaction.userBetId);
          const offer = await base44.entities.BetOffer.get(ub.offer_id);
          const newMatched = (offer.amount_matched || 0) + ub.amount;
          const newUnmatched = offer.amount_offered - newMatched;
          const newStatus = newUnmatched <= 0.01 ? 'fully_matched' : 'partially_matched';
          
          await base44.entities.BetOffer.update(offer.id, {
            amount_matched: newMatched,
            amount_unmatched: Math.max(0, newUnmatched),
            status: newStatus,
          });
          
          // Update UserBet to active
          await base44.entities.UserBet.update(pendingTransaction.userBetId, { 
            status: 'active',
            transaction_signature: txResult?.signature 
          });
          
          // Update LP bet
          const lpBets = await base44.entities.UserBet.filter({ offer_id: offer.id, role: 'lp' });
          if (lpBets.length > 0) {
            const lpWin = ub.amount;
            const lpPayout = offer.amount_offered + lpWin;
            await base44.entities.UserBet.update(lpBets[0].id, {
              status: 'active',
              potential_payout: lpPayout,
            });
          }
          
          // Update Bet totals
          const backedField = ub.outcome === 'a' ? 'backed_amount_a' : ub.outcome === 'b' ? 'backed_amount_b' : 'backed_amount_draw';
          await base44.entities.Bet.update(ub.bet_id, {
            [backedField]: (bet[backedField] || 0) + ub.amount,
            total_pool: (bet.total_pool || 0) + ub.amount,
            total_bettors: (bet.total_bettors || 0) + 1,
          });
        }
      } catch (err) {
        console.error('Failed to update records after transaction:', err);
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['offersForBet', bet?.id] });
    queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
    queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
    queryClient.invalidateQueries({ queryKey: ['allUserBetsForBet', bet?.id] });
    resetForm();
  };

  const handleTransactionError = (err) => {
    console.error('Transaction failed:', err);
    if (pendingTransaction?.userBetId) {
      base44.entities.UserBet.update(pendingTransaction.userBetId, { status: 'refunded' });
    }
    setPendingTransaction(null);
  };

  function getOutcomeLabel(o) {
    if (!match || !bet) return o;
    if (o === 'a') return bet.outcome_a || match.team_a;
    if (o === 'b') return bet.outcome_b || match.team_b;
    return 'Draw';
  }

  if (!match) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';
  const hasBet = !!bet;
  const isOpen = bet?.status === 'open';
  const isSettled = bet?.status === 'settled';

  const avA = totalAvailable(offers, 'a');
  const avB = totalAvailable(offers, 'b');
  const avDraw = totalAvailable(offers, 'draw');
  const { oddsA, oddsB, oddsDraw } = calcOdds(avA, avB, avDraw);
  const totalLiquidity = avA + avB + avDraw;

  const stakeNum = parseFloat(amount) || 0;
  const matchOdds = selectedOutcome === 'a' ? oddsA : selectedOutcome === 'b' ? oddsB : oddsDraw;
  const opposingKeys = selectedOutcome ? ['a', 'b', 'draw'].filter(k => k !== selectedOutcome) : [];
  const matchMax = matchingOffer
    ? matchingOffer.amount_unmatched
    : opposingKeys.reduce((sum, k) => sum + totalAvailable(offers, k), 0);
  const matchWin = stakeNum * (matchOdds || 0);
  const matchFee = matchWin * FEE_BPS / 10000;
  const matchPayout = stakeNum + matchWin - matchFee;

  const OUTCOMES = [
    { key: 'a', label: bet?.outcome_a || match.team_a, flag: match.team_a_flag, odds: oddsA, available: avA, color: 'primary' },
    { key: 'draw', label: 'Draw', flag: '🤝', odds: oddsDraw, available: avDraw, color: 'yellow' },
    { key: 'b', label: bet?.outcome_b || match.team_b, flag: match.team_b_flag, odds: oddsB, available: avB, color: 'accent' },
  ];

  const openOffers = offers.filter(o => o.status === 'open' || o.status === 'partially_matched' || o.status === 'pending');

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to matches
      </Link>

      {/* ── Match Header ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-muted-foreground font-medium">{match.group_stage || 'World Cup 2026'}</span>
          <div className="flex items-center gap-2">
            {match.match_time && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(match.match_time), 'MMM d · h:mm a')}
              </span>
            )}
            <Badge className={`text-[10px] uppercase tracking-wider ${
              match.status === 'live' ? 'bg-destructive/20 text-destructive' :
              match.status === 'finished' ? 'bg-muted text-muted-foreground' :
              'bg-secondary text-secondary-foreground'
            }`}>
              {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mr-1" />}
              {match.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="text-5xl mb-3">{match.team_a_flag || '🏳️'}</div>
            <p className="font-heading font-black text-lg">{match.team_a}</p>
          </div>
          <div className="text-center">
            {match.status === 'finished' || match.status === 'live' ? (
              <div className="flex items-center gap-3">
                <span className="text-4xl font-heading font-bold">{match.score_a ?? 0}</span>
                <span className="text-muted-foreground text-xl">-</span>
                <span className="text-4xl font-heading font-bold">{match.score_b ?? 0}</span>
              </div>
            ) : (
              <span className="text-sm font-bold text-primary bg-primary/10 px-4 py-2 rounded-full">VS</span>
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="text-5xl mb-3">{match.team_b_flag || '🏳️'}</div>
            <p className="font-heading font-black text-lg">{match.team_b}</p>
          </div>
        </div>
      </motion.div>

      {/* ── No market yet ── */}
      {!hasBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-primary/20 rounded-2xl p-5 text-center">
          <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="font-heading font-bold mb-1">Open Betting Market</h3>
          <p className="text-xs text-muted-foreground mb-4">Create the market so users can start offering liquidity P2P</p>
          <Button onClick={() => createMarketMutation.mutate()} disabled={createMarketMutation.isPending}
            className="bg-primary hover:bg-primary/90 font-heading font-bold h-11 rounded-xl px-8">
            {createMarketMutation.isPending ? 'Opening...' : 'Open Market'}
          </Button>
        </motion.div>
      )}

      {/* ── Market Odds ── */}
      {hasBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Current Odds
            </h3>
            <Badge className={`text-[10px] ${isOpen ? 'bg-accent/20 text-accent' : 'bg-secondary text-secondary-foreground'}`}>
              {bet.status}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {OUTCOMES.map(o => (
              <div key={o.key} className={`rounded-xl p-3 text-center border ${
                o.color === 'primary' ? 'bg-primary/5 border-primary/20' :
                o.color === 'accent' ? 'bg-accent/5 border-accent/20' :
                'bg-yellow-500/5 border-yellow-500/20'
              }`}>
                <p className="text-xs text-muted-foreground mb-1 truncate">{o.label}</p>
                <p className={`font-heading font-black text-xl ${
                  o.color === 'primary' ? 'text-primary' : o.color === 'accent' ? 'text-accent' : 'text-yellow-400'
                }`}>
                  {o.odds !== null ? `${o.odds.toFixed(2)}x` : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {o.odds !== null ? 'current odds' : 'no offers yet'}
                </p>
              </div>
            ))}
          </div>

          {totalLiquidity > 0 && (
            <div className="text-xs text-muted-foreground text-center">
              ◎{totalLiquidity.toLocaleString()} total liquidity available across all outcomes
            </div>
          )}

          {totalLiquidity === 0 && (
            <div className="text-center py-2 text-xs text-muted-foreground bg-secondary/30 rounded-xl px-4">
              No open offers yet — be the first to provide liquidity below!
            </div>
          )}
        </motion.div>
      )}

      {/* ── How It Works (collapsible) — shown right after odds ── */}
      {hasBet && isOpen && (
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowHowItWorks(v => !v)}
            className="w-full flex items-center justify-between p-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2"><Info className="w-4 h-4" /> How does P2P betting work?</span>
            {showHowItWorks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {showHowItWorks && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden">
                <div className="px-4 pb-4 grid gap-3">
                  <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                    <p className="text-xs font-bold text-primary mb-1">🏦 Open an Offer (be the "house")</p>
                    <p className="text-xs text-muted-foreground">Put up funds backing an outcome (e.g. Mexico wins). You collect the other person's stake if you're right. Others bet against you.</p>
                  </div>
                  <div className="bg-accent/5 border border-accent/15 rounded-xl p-3">
                    <p className="text-xs font-bold text-accent mb-1">🎯 Match a Bet (bet against an offer)</p>
                    <p className="text-xs text-muted-foreground">Pick your outcome and stake against someone else's open offer. Odds are determined by the ratio of liquidity on each side.</p>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3">
                    <p className="text-xs font-bold text-foreground mb-1">💡 Odds explained</p>
                    <p className="text-xs text-muted-foreground">Odds = how much you win per ◎1 staked. 2.00x means stake ◎10, win ◎10 profit (◎20 total). A 2% fee applies to winnings only.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Action Panel ── */}
      {hasBet && isOpen && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-primary/20 rounded-2xl p-5">

          {/* Mode selector */}
          {!mode && (
            <div className="space-y-3">
              <h3 className="font-heading font-bold text-base mb-1">Place a Bet</h3>
              <p className="text-xs text-muted-foreground mb-4">Choose how you want to participate in this market.</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMode('offer')}
                  className="flex flex-col items-start gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 hover:border-primary/60 transition-all text-left">
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    <p className="font-heading font-bold text-sm text-primary">Open Offer</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">Back an outcome with your funds. Others bet against you. You earn their stake if you're right.</p>
                </button>
                <button onClick={() => setMode('match')} disabled={totalLiquidity <= 0}
                  className="flex flex-col items-start gap-2 rounded-xl border-2 border-accent/30 bg-accent/5 p-4 hover:border-accent/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-accent" />
                    <p className="font-heading font-bold text-sm text-accent">Match a Bet</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {totalLiquidity > 0
                      ? 'Bet against an open offer. Pick your outcome and stake at live odds.'
                      : 'No open offers yet. Be the first to open one!'}
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* OFFER MODE */}
          {mode === 'offer' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-bold text-sm">Open an Offer</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Pick the outcome you think will win and put up funds.</p>
                </div>
                <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary/50">✕ Cancel</button>
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-2">Step 1 — Which outcome do you want to back?</p>
                <div className="grid grid-cols-3 gap-2">
                  {OUTCOMES.map(o => (
                    <button key={o.key}
                      onClick={() => { setSelectedOutcome(o.key); setAmount(''); }}
                      className={`rounded-xl p-3 border-2 text-center transition-all ${
                        selectedOutcome === o.key
                          ? o.color === 'primary' ? 'border-primary bg-primary/10' :
                            o.color === 'accent' ? 'border-accent bg-accent/10' :
                            'border-yellow-500 bg-yellow-500/10'
                          : 'border-border/50 bg-secondary/30 hover:border-border'
                      }`}>
                      <div className="text-2xl mb-1">{o.flag}</div>
                      <p className="font-heading font-bold text-xs">{o.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">wins</p>
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence>
                {selectedOutcome && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden">
                    <div>
                      <p className="text-xs font-medium text-foreground mb-2">Step 2 — How much do you want to offer?</p>
                      <Input type="number" placeholder="0.00" value={amount} min={1}
                       onChange={e => setAmount(e.target.value)}
                       className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
                      <div className="flex gap-2 flex-wrap mt-2">
                       {QUICK_AMOUNTS.map(qa => (
                         <button key={qa} onClick={() => setAmount(String(qa))}
                           className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">◎{qa}</button>
                        ))}
                      </div>
                    </div>

                    {stakeNum > 0 && (
                      <div className="bg-secondary/40 rounded-xl p-4 space-y-2 text-xs">
                        <p className="font-bold text-foreground mb-2">Summary</p>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">You're backing</span>
                          <span className="font-bold">{getOutcomeLabel(selectedOutcome)} to win</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Your offer amount</span>
                          <span className="font-bold">◎{stakeNum.toFixed(2)}</span>
                        </div>
                        <div className="h-px bg-border/30 my-1" />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">If {getOutcomeLabel(selectedOutcome)} wins</span>
                          <span className="font-bold text-accent">You keep matcher's full stake (0% fee)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">If unmatched</span>
                          <span className="font-bold text-yellow-400">Your ◎{stakeNum.toFixed(2)} is refunded</span>
                        </div>
                      </div>
                    )}

                    {!isConnected ? (
                      <Button
                        onClick={async () => {
                          await connect();
                          setTimeout(() => refreshUser(), 1000);
                        }}
                        disabled={isConnecting}
                        className="w-full h-12 font-heading font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
                      >
                        {isConnecting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Wallet className="w-4 h-4 mr-2" />
                            Connect Wallet to Bet
                          </>
                        )}
                      </Button>
                    ) : pendingTransaction ? (
                      <SolanaTransactionSigner
                        instruction={pendingTransaction.instruction}
                        amount={pendingTransaction.amount}
                        userBetId={pendingTransaction.userBetId}
                        offerId={pendingTransaction.offerId}
                        isOffer={pendingTransaction.isOffer}
                        onSuccess={handleTransactionSuccess}
                        onError={handleTransactionError}
                      />
                    ) : (
                      <Button
                        onClick={() => openOfferMutation.mutate({ outcome: selectedOutcome, offerOutcomeLabel: getOutcomeLabel(selectedOutcome), offerAmount: stakeNum })}
                        disabled={stakeNum <= 0 || openOfferMutation.isPending}
                        className="w-full h-12 font-heading font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                        {openOfferMutation.isPending
                          ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          : `Offer ◎${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'} on ${getOutcomeLabel(selectedOutcome)}`}
                      </Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* MATCH MODE */}
          {mode === 'match' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-bold text-sm">Match a Bet</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Pick your outcome and bet against existing offers.</p>
                </div>
                <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary/50">✕ Cancel</button>
              </div>

              {matchingOffer && (
                <div className="bg-secondary/40 rounded-xl p-3 text-xs border border-border/30">
                  <p className="text-muted-foreground">Betting against a specific <span className="font-bold text-foreground">{getOutcomeLabel(matchingOffer.outcome)}</span> offer · <span className="font-bold text-accent">◎{matchingOffer.amount_unmatched?.toFixed(2)} available</span></p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-foreground mb-2">Step 1 — Which outcome do you think will win?</p>
                <div className="grid grid-cols-3 gap-2">
                  {OUTCOMES.map(o => {
                    const opposingLiquidity = matchingOffer
                      ? (o.key !== matchingOffer.outcome ? matchingOffer.amount_unmatched : 0)
                      : OUTCOMES.filter(other => other.key !== o.key).reduce((sum, other) => sum + totalAvailable(offers, other.key), 0);
                    const disabled = opposingLiquidity <= 0 || (matchingOffer && o.key === matchingOffer.outcome);
                    return (
                      <button key={o.key}
                        onClick={() => { if (!disabled) { setSelectedOutcome(o.key); setAmount(''); } }}
                        disabled={disabled}
                        className={`rounded-xl p-3 border-2 text-center transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                          selectedOutcome === o.key
                            ? o.color === 'primary' ? 'border-primary bg-primary/10' :
                              o.color === 'accent' ? 'border-accent bg-accent/10' :
                              'border-yellow-500 bg-yellow-500/10'
                            : 'border-border/50 bg-secondary/30 hover:border-border'
                        }`}>
                        <div className="text-2xl mb-1">{o.flag}</div>
                        <p className="font-heading font-bold text-xs">{o.label}</p>
                        <p className={`text-[10px] font-bold mt-0.5 ${
                          o.color === 'primary' ? 'text-primary' : o.color === 'accent' ? 'text-accent' : 'text-yellow-400'
                        }`}>
                          {o.odds !== null ? `${o.odds.toFixed(2)}x` : '—'}
                        </p>
                        <p className="text-[9px] text-muted-foreground">◎{opposingLiquidity.toFixed(0)} avail.</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {selectedOutcome && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden">
                    <div>
                      <p className="text-xs font-medium text-foreground mb-2">Step 2 — How much do you want to stake? <span className="text-muted-foreground">(max ◎{matchMax.toFixed(2)})</span></p>
                      <Input type="number" placeholder="0.00" value={amount} min={0} max={matchMax}
                        onChange={e => setAmount(Math.min(parseFloat(e.target.value) || 0, matchMax).toString())}
                        className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
                      <div className="flex gap-2 flex-wrap mt-2">
                        {QUICK_AMOUNTS.filter(q => q <= matchMax).map(qa => (
                          <button key={qa} onClick={() => setAmount(String(qa))}
                            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">◎{qa}</button>
                        ))}
                        <button onClick={() => setAmount(matchMax.toFixed(2))}
                          className="px-3 py-1.5 text-xs font-bold bg-accent/10 hover:bg-accent/20 text-accent rounded-lg">MAX</button>
                      </div>
                    </div>

                    {stakeNum > 0 && (
                      <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-2 text-xs">
                        <p className="font-bold text-foreground mb-2">Your bet summary</p>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">You're betting on</span>
                          <span className="font-bold">{getOutcomeLabel(selectedOutcome)} to win</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Your stake</span>
                          <span className="font-bold">◎{stakeNum.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current odds</span>
                          <span className="font-bold">{matchOdds !== null ? `${matchOdds.toFixed(2)}x` : '—'}</span>
                        </div>
                        <div className="h-px bg-border/30 my-1" />
                        <div className="flex justify-between font-bold text-sm">
                          <span>If you win, you get</span>
                          <span className="text-accent text-base">◎{matchPayout.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Profit if you win</span>
                          <span className="text-accent">+◎{(matchWin - matchFee).toFixed(2)}</span>
                        </div>
                        <p className="text-muted-foreground text-[10px] pt-1">0% fee - fully decentralized P2P betting</p>
                      </div>
                    )}

                    {!isConnected ? (
                      <Button
                        onClick={async () => {
                          await connect();
                          setTimeout(() => refreshUser(), 1000);
                        }}
                        disabled={isConnecting}
                        className="w-full h-12 font-heading font-bold text-sm bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl"
                      >
                        {isConnecting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin mr-2" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Wallet className="w-4 h-4 mr-2" />
                            Connect Wallet to Bet
                          </>
                        )}
                      </Button>
                    ) : pendingTransaction ? (
                      <SolanaTransactionSigner
                        instruction={pendingTransaction.instruction}
                        amount={pendingTransaction.amount}
                        userBetId={pendingTransaction.userBetId}
                        offerId={pendingTransaction.offerId}
                        isOffer={pendingTransaction.isOffer || false}
                        onSuccess={handleTransactionSuccess}
                        onError={handleTransactionError}
                      />
                    ) : (
                      <Button
                        onClick={() => {
                          const offerToMatch = matchingOffer || openOffers.find(o =>
                            o.outcome !== selectedOutcome &&
                            o.amount_unmatched >= stakeNum
                          );
                          if (offerToMatch) {
                            matchOfferMutation.mutate({ offer: offerToMatch, matchAmount: stakeNum });
                          }
                        }}
                        disabled={stakeNum <= 0 || stakeNum > matchMax || matchOfferMutation.isPending || !isConnected}
                        className="w-full h-12 font-heading font-bold text-sm bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl"
                      >
                        {matchOfferMutation.isPending
                          ? <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                          : !isConnected
                          ? 'Connect Wallet First'
                          : `Bet ◎${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'} on ${getOutcomeLabel(selectedOutcome)}`}
                      </Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      {hasBet && !isOpen && isAdmin && !isSettled && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-accent/20 rounded-2xl p-5 space-y-4">
          <div className="text-center">
            <Trophy className="w-8 h-8 text-accent mx-auto mb-2" />
            <h3 className="font-heading font-bold mb-1">Settle This Bet</h3>
            <p className="text-xs text-muted-foreground mb-4">Select the winning outcome to distribute winnings</p>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['a', 'b', 'draw'].map(outcome => (
                <Button
                  key={outcome}
                  onClick={() => {
                    if (confirm(`Confirm ${outcome === 'draw' ? 'Draw' : outcome === 'a' ? bet.outcome_a : bet.outcome_b} won? This will distribute winnings to all winners.`)) {
                      base44.functions.invoke('announceWinner', {
                        bet_id: bet.id,
                        winning_outcome: outcome
                      }).then(res => {
                        if (res.data.success) {
                          alert(res.data.message);
                          queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
                          queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
                        } else {
                          alert('Error: ' + res.data.error);
                        }
                      }).catch(err => {
                        alert('Failed to settle: ' + err.message);
                      });
                    }
                  }}
                  className={`h-10 font-heading font-bold text-xs rounded-xl ${
                    outcome === 'a' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' :
                    outcome === 'b' ? 'bg-accent hover:bg-accent/90 text-accent-foreground' :
                    'bg-yellow-500 hover:bg-yellow-500/90 text-white'
                  }`}
                >
                  {outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw'}
                </Button>
              ))}
            </div>
            
            <div className="text-xs text-muted-foreground bg-secondary/30 rounded-xl p-3">
              <p className="font-bold text-foreground mb-1">Distribution Summary:</p>
              <p>• Winners: All bets on the selected outcome will be marked as "won"</p>
              <p>• Losers: All other bets marked as "lost"</p>
              <p>• Payout: Winners can claim their potential payout</p>
            </div>
          </div>
        </motion.div>
      )}

      {hasBet && !isOpen && isSettled && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-accent/20 rounded-2xl p-5 text-center">
          <CheckCircle2 className="w-8 h-8 text-accent mx-auto mb-2" />
          <h3 className="font-heading font-bold mb-1">Bet Settled</h3>
          <p className="text-xs text-muted-foreground">
            Winner: <span className="font-bold text-accent">
              {bet.winning_outcome === 'a' ? bet.outcome_a : bet.winning_outcome === 'b' ? bet.outcome_b : 'Draw'}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">Winnings have been distributed to winners</p>
        </motion.div>
      )}

      {hasBet && !isOpen && !isAdmin && (
        <div className="text-center py-8 bg-card border border-border/50 rounded-2xl">
          <p className="text-muted-foreground text-sm">{isSettled ? 'Market settled.' : 'Betting is closed.'}</p>
        </div>
      )}

      {/* ── Open Offers ── */}
      {hasBet && isOpen && openOffers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
          <div>
            <h3 className="font-heading font-bold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" /> Open Offers
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">These are offers you can bet against. Click "Match" to bet against one.</p>
          </div>
          {OUTCOMES.map(o => {
            const oOffers = openOffers.filter(of => of.outcome === o.key);
            if (oOffers.length === 0) return null;
            return (
              <div key={o.key}>
                <p className={`text-xs font-bold mb-2 ${
                  o.color === 'primary' ? 'text-primary' : o.color === 'accent' ? 'text-accent' : 'text-yellow-400'
                }`}>{o.label} offers</p>
                <div className="space-y-2">
                  {oOffers.map(offer => (
                    <div key={offer.id} className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2.5">
                      <div className="text-xs">
                        <span className="font-bold">◎{offer.amount_unmatched?.toFixed(2)}</span>
                        <span className="text-muted-foreground"> available</span>
                        <span className="text-muted-foreground ml-2">of ◎{offer.amount_offered?.toFixed(2)} total</span>
                      </div>
                      <Button size="sm" variant="outline"
                        onClick={() => {
                          setMatchingOffer(offer);
                          setMode('match');
                          const opp = offer.outcome === 'a' ? 'b' : offer.outcome === 'b' ? 'a' : 'a';
                          setSelectedOutcome(opp);
                          setAmount('');
                        }}
                        className="h-7 text-xs font-bold border-accent/40 text-accent hover:bg-accent/10">
                        Bet against this
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* ── My Positions ── */}
      {myActiveBets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-primary/20 rounded-2xl p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> My Positions
          </h3>
          {myActiveBets.map(ub => (
            <div key={ub.id} className="bg-secondary/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{ub.outcome_label}</span>
                  <Badge className={`text-[9px] py-0 ${
                    ub.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                    ub.status === 'active' ? 'bg-accent/20 text-accent' :
                    ub.status === 'won' ? 'bg-accent/30 text-accent' :
                    ub.status === 'lost' ? 'bg-destructive/20 text-destructive' :
                    'bg-secondary text-secondary-foreground'
                  }`}>
                    {ub.status === 'pending' && ub.role === 'lp' ? 'Waiting for match' : ub.status}
                  </Badge>
                  {ub.role === 'lp' && <span className="text-[10px] text-muted-foreground">LP offer</span>}
                </div>
                <span className="font-bold">◎{ub.amount?.toFixed(2)}</span>
              </div>
              {ub.potential_payout > 0 && (
                <p className="text-xs text-muted-foreground">
                  Potential payout if you win: <span className="text-accent font-bold">◎{ub.potential_payout?.toFixed(2)}</span>
                </p>
              )}
              {ub.status === 'won' && (
                <Button onClick={() => claimMutation.mutate(ub.id)} size="sm"
                  className="w-full mt-2 h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-lg">
                  Claim ◎{ub.actual_payout?.toFixed(2) || ub.potential_payout?.toFixed(2)}
                </Button>
              )}
              {ub.status === 'pending' && ub.role === 'lp' && (
                <Button onClick={() => cancelOfferMutation.mutate(ub)} size="sm"
                  disabled={cancelOfferMutation.isPending}
                  variant="outline"
                  className="w-full mt-2 h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg">
                  Cancel & Refund
                </Button>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Recent Activity ── */}
      {allUserBets.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" /> Recent Bets
          </h3>
          <div className="space-y-2">
            {allUserBets.slice(0, 8).map(ub => (
              <div key={ub.id} className="flex items-center justify-between text-xs py-2 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${ub.role === 'lp' ? 'bg-yellow-400' : 'bg-accent'}`} />
                  <span className="font-medium">{ub.outcome_label}</span>
                  <span className="text-muted-foreground text-[10px]">{ub.role === 'lp' ? '· opened offer' : '· matched bet'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold">◎{ub.amount?.toFixed(2)}</span>
                  {ub.potential_payout > 0 && <span className="text-accent font-medium">→ ◎{ub.potential_payout?.toFixed(2)} if win</span>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}