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

  // Extract unique groups from open bets
  const groupSet = new Set(openBets.map(bet => {
    const match = matches.find(m => m.id === bet.match_id);
    return match?.group_stage;
  }).filter(Boolean));
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

  const provideLiquidityMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!selectedBet) throw new Error('No bet selected');
      if (!walletAddress) throw new Error('Wallet not connected');

      const res = await base44.functions.invoke('provideLiquidity', {
        walletAddress,
        bet_id: selectedBet.id,
        match_id: selectedBet.match_id,
        outcome: selectedOutcome,
        amount: amt,
      });

      if (res.data.error) throw new Error(res.data.error);
      if (!res.data.solana_instruction) {
        throw new Error(res.data.hint || 'Market not initialized on-chain.');
      }
      return res.data;
    },
    onSuccess: (data) => {
      setPendingTx({
        instruction: data.solana_instruction,
        amount: parseFloat(amount),
        type: 'provide_liquidity',
      });
      setPendingCommitData(data.commit_data);
    },
    onError: (err) => {
      setError(err.message || 'Failed to provide liquidity');
    },
  });

  const withdrawLiquidityMutation = useMutation({
    mutationFn: async (offer) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const res = await base44.functions.invoke('withdrawLiquidity', {
        walletAddress,
        userBetId: offer.userBetId,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setPendingTx({
        instruction: data.solana_instruction,
        amount: data.amount,
        type: 'withdraw_liquidity',
        userBetId: data.userBetId,
        offerId: data.offerId,
      });
    },
    onError: (err) => {
      setError(err.message || 'Failed to withdraw liquidity');
    },
  });

  const handleTxSuccess = async (txResult) => {
    const signature = txResult.signature;
    const committedAmount = parseFloat(amount);
    
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
    
    const outcomeLabel = selectedBet && selectedOutcome === 'a' ? selectedBet.outcome_a : selectedOutcome === 'b' ? selectedBet?.outcome_b : 'Draw';
    const matchTitle = selectedBet ? `${selectedBet.outcome_a} vs ${selectedBet.outcome_b}` : 'Market';
    
    setSuccessDialog({
      signature,
      amount: committedAmount,
      team: outcomeLabel,
      match: matchTitle,
    });
    
    setPendingTx(null);
    setAmount('');
    setSelectedBet(null);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['openBets'] });
  };

  const handleTxError = (err) => {
    setPendingTx(null);
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
    setTimeout(() => {
      refetchOffers();
      refetchUserBets();
    }, 300);
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
  
  const offersWithUserBet = myOffers.map(offer => {
    const userBet = allUserBets.find(ub => ub.offer_id === offer.id);
    return { ...offer, userBetId: userBet?.id };
  });

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
  };

  const handleDetailModalCommit = ({ bet, outcome, amount, potentialLiability }) => {
    setSelectedBet(bet);
    setSelectedOutcome(outcome);
    setAmount(String(amount));
    setDetailModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <SuccessDialog open={!!successDialog} data={successDialog} onClose={() => setSuccessDialog(null)} />
      <SuccessDialog open={!!withdrawSuccessDialog} data={withdrawSuccessDialog} onClose={() => setWithdrawSuccessDialog(null)} isWithdraw={true} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-black text-2xl mb-1">LP Dashboard</h1>
          <p className="text-sm text-muted-foreground">Provide liquidity for matches & futures</p>
        </div>
      </div>

      {/* ── BRANDED LP EXPLANATION BANNER ── */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-[#1a1040]/80 via-[#0f0a1e]/90 to-[#12102a]/80 border border-primary/20 rounded-2xl p-6 relative overflow-hidden mb-6"
      >
        {/* Decorative Glow Orbs */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl opacity-25 bg-[#a69cf2]" />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full blur-2xl opacity-15 bg-[#14f195]" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-3 py-1 rounded-full text-primary text-[10px] font-bold tracking-widest uppercase">
              👑 Be the House
            </div>
            <h2 className="font-heading font-black text-lg md:text-xl text-white">How Liquidity Providing Works</h2>
            <p className="text-xs text-white/70 leading-relaxed">
              ElevenX has no house edge or greedy middlemen. Instead, <strong>YOU</strong> get to act as the bookmaker, set the odds, and take the other side of the action!
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10 relative z-10">
          <div className="space-y-1.5">
            <span className="text-xl">🎲</span>
            <h3 className="font-heading font-bold text-xs text-primary">1. Underwrite an Outcome</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              By providing liquidity on an outcome (e.g. Mexico), you are betting <strong>against</strong> it. If Mexico loses or draws, you keep your deposit and win the bettors' money!
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xl">📈</span>
            <h3 className="font-heading font-bold text-xs text-accent">2. Earn Organic Yield</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your SOL is locked on-chain to cover incoming bets. When bettors lose, their stake is paid directly into your LP position, growing your capital.
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xl">🔓</span>
            <h3 className="font-heading font-bold text-xs text-yellow-400">3. 100% Flexible Withdrawals</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your funds are yours. Any portion of your committed liquidity that hasn't been matched by an active bettor can be withdrawn <strong>instantly at any time</strong>.
            </p>
          </div>
        </div>
      </motion.div>

      {!isConnected && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/20 p-8 text-center"
          style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}>
          <Wallet className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-heading font-black text-xl text-white mb-2">Connect Wallet to Provide Liquidity</h3>
          <p className="text-white/50 text-sm mb-5 max-w-xs mx-auto">Connect your Phantom wallet to start providing LP liquidity and earning yield.</p>
          <Button onClick={connect} className="font-heading font-bold px-8 h-11 rounded-xl"
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
            <Wallet className="w-4 h-4 mr-2" /> Connect Phantom
          </Button>
        </motion.div>
      )}

      {isConnected && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-6 bg-secondary/50">
            <TabsTrigger value="matches" className="font-heading font-bold">
              <TrendingUp className="w-4 h-4 mr-2" /> Match LP
            </TabsTrigger>
            <TabsTrigger value="futures" className="font-heading font-bold">
              <Trophy className="w-4 h-4 mr-2" /> Futures LP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Committed', value: `◎${totalCommitted.toFixed(4)}`, icon: DollarSign, color: 'text-primary' },
                { label: 'Matched', value: `◎${totalMatched.toFixed(4)}`, icon: CheckCircle2, color: 'text-accent' },
                { label: 'Unmatched', value: `◎${totalUnmatched.toFixed(4)}`, icon: Clock, color: 'text-yellow-400' },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border/50 rounded-2xl p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`font-heading font-bold text-lg ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Provide liquidity panel */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-card border border-primary/20 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                <h2 className="font-heading font-bold text-sm">Provide Liquidity</h2>
              </div>

              {error && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <AlertDescription className="text-destructive text-sm">
                    {error}
                    <Button variant="link" className="p-0 h-auto text-destructive underline ml-2" onClick={() => setError(null)}>Dismiss</Button>
                  </AlertDescription>
                </Alert>
              )}

              {pendingTx && pendingTx.type === 'provide_liquidity' ? (
                <SolanaTransactionSigner
                  instruction={pendingTx.instruction}
                  amount={pendingTx.amount}
                  onSuccess={handleTxSuccess}
                  onError={handleTxError}
                />
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted-foreground">Select Market</label>
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
                    ) : (
                      <div>
                        {/* Group Navigation */}
                        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
                          <button
                            onClick={() => setActiveGroup('all')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                              activeGroup === 'all'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                            }`}
                          >
                            All Groups
                          </button>
                          {groups.filter(g => g !== 'all').map(group => (
                            <button
                              key={group}
                              onClick={() => setActiveGroup(group)}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                                activeGroup === group
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                              }`}
                            >
                              {group}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
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
                              const actualOdds = oddsNum < 10 ? oddsNum : oddsNum / 100;
                              displayOdds = actualOdds.toFixed(2) + 'x';
                            }
                            return (
                              <button key={o.key}
                                onClick={() => setSelectedOutcome(o.key)}
                                className={`rounded-xl p-3 border-2 text-center transition-all ${
                                  selectedOutcome === o.key
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border/50 bg-secondary/30 hover:border-border'
                                }`}>
                                <p className="font-heading font-bold text-xs">{o.label}</p>
                                <p className="text-primary font-bold text-sm mt-0.5">{displayOdds}</p>
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
                        onClick={() => provideLiquidityMutation.mutate()}
                        disabled={!amount || parseFloat(amount) <= 0 || provideLiquidityMutation.isPending}
                        className="w-full h-12 font-heading font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                        {provideLiquidityMutation.isPending ? (
                          <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        ) : `Commit ◎${parseFloat(amount) || 0} Liquidity`}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </motion.div>

            {/* My active offers */}
            {activeOffers.length > 0 && (
              <section>
                <h2 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Active LP Positions ({activeOffers.length})
                </h2>
                <div className="space-y-2">
                  {activeOffers.map((offer, i) => {
                    const offerWithUserBet = offersWithUserBet.find(o => o.id === offer.id) || offer;
                    const matchPct = offer.amount_offered > 0
                      ? Math.round((offer.amount_matched / offer.amount_offered) * 100)
                      : 0;
                    const hasUnmatched = (offer.amount_unmatched || 0) > 0;
                    
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
                            {pendingTx && pendingTx?.userBetId === offerWithUserBet.userBetId ? (
                              <SolanaTransactionSigner
                                instruction={pendingTx.instruction}
                                amount={pendingTx.amount}
                                onSuccess={handleWithdrawSuccess}
                                onError={handleTxError}
                              />
                            ) : (
                              <Button
                                onClick={() => withdrawLiquidityMutation.mutate(offerWithUserBet)}
                                disabled={withdrawLiquidityMutation.isPending}
                                variant="outline"
                                className="w-full h-8 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 rounded-lg"
                              >
                                {withdrawLiquidityMutation.isPending ? (
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
              </section>
            )}

            {myOffers.length === 0 && (
              <div className="text-center py-12">
                <TrendingUp className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No LP positions yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Select a market above to provide your first liquidity</p>
              </div>
            )}
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
        onCommit={({ bet, outcome, amount }) => {
          setSelectedBet(bet);
          setSelectedOutcome(outcome);
          setAmount(String(amount));
          setDetailModalOpen(false);
          setSelectedBetForDetail(null);
        }}
      />
    </div>
  );
}