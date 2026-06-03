import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, ArrowRight, Plus, Clock, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

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

  const [selectedBet, setSelectedBet] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('a');
  const [amount, setAmount] = useState('');
  const [pendingTx, setPendingTx] = useState(null);
  const [successDialog, setSuccessDialog] = useState(null);
  const [withdrawSuccessDialog, setWithdrawSuccessDialog] = useState(null);
  const [error, setError] = useState(null);

  const { data: openBets = [] } = useQuery({
    queryKey: ['openBets'],
    queryFn: () => base44.entities.Bet.filter({ status: 'open' }),
  });

  const { data: myOffers = [] } = useQuery({
    queryKey: ['myOffers', walletAddress],
    queryFn: () => base44.entities.BetOffer.list('-created_date', 100),
    enabled: !!walletAddress,
    select: (offers) => offers.filter(o => o.lp_wallet_address === walletAddress),
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list(),
  });

  const [pendingCommitData, setPendingCommitData] = useState(null);

  const provideLiquidityMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!selectedBet) throw new Error('No bet selected');
      if (!walletAddress) throw new Error('Wallet not connected');

      console.log('[LpDashboard] === WALLET ADDRESS DEBUG ===', {
        walletAddress,
        walletAddress_length: walletAddress?.length,
        walletAddress_first8: walletAddress?.slice(0, 8),
        walletAddress_last8: walletAddress?.slice(-8),
        type: typeof walletAddress,
      });

      const res = await base44.functions.invoke('provideLiquidity', {
        walletAddress,
        bet_id: selectedBet.id,
        match_id: selectedBet.match_id,
        outcome: selectedOutcome,
        _debug_outcome_type: typeof selectedOutcome,
        _debug_outcome_value: selectedOutcome,
        amount: amt,
      });

      if (res.data.error) throw new Error(res.data.error);
      if (!res.data.solana_instruction) {
        throw new Error(res.data.hint || 'Market not initialized on-chain. Please initialize the market from the Admin panel first.');
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
      console.error('[LpDashboard] LP mutation error:', err);
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
      console.error('[LpDashboard] Withdraw error:', err);
      setError(err.message || 'Failed to withdraw liquidity');
    },
  });

  const handleTxSuccess = async (txResult) => {
    const signature = txResult.signature;
    const committedAmount = parseFloat(amount);
    
    // Commit liquidity to DB after on-chain success
    if (pendingCommitData) {
      try {
        const commitRes = await base44.functions.invoke('commitLiquidity', {
          signature,
          commit_data: pendingCommitData,
        });
        if (commitRes.data.error) {
          console.error('[LpDashboard] commitLiquidity error:', commitRes.data.error);
          setError('On-chain succeeded but DB commit failed: ' + commitRes.data.error);
        }
      } catch (err) {
        console.error('[LpDashboard] commitLiquidity threw:', err);
        setError('DB commit failed: ' + err.message);
      }
      setPendingCommitData(null);
    }
    
    // Get outcome label and match info safely
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
    console.error('LP transaction failed:', err);
    setPendingTx(null);
  };

  const handleWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    
    // Finalize withdrawal in DB
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
    queryClient.invalidateQueries({ queryKey: ['myOffers', walletAddress] });
  };

  // Stats
  const totalCommitted = myOffers.reduce((s, o) => s + (o.amount_offered || 0), 0);
  const totalMatched   = myOffers.reduce((s, o) => s + (o.amount_matched || 0), 0);
  const totalUnmatched = myOffers.reduce((s, o) => s + (o.amount_unmatched || 0), 0);
  const activeOffers   = myOffers.filter(o => o.status === 'open' || o.status === 'partially_matched');
  
  // Get userBetId for each offer (for withdrawal)
  const { data: allUserBets = [] } = useQuery({
    queryKey: ['allUserBets', walletAddress],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 200);
      return all.filter(ub => ub.wallet_address === walletAddress && ub.role === 'lp');
    },
    enabled: !!walletAddress,
  });
  
  // Enrich offers with userBetId
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

  const selectedBetObj = openBets.find(b => b.id === selectedBet?.id) || selectedBet;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <SuccessDialog
        open={!!successDialog}
        data={successDialog}
        onClose={() => setSuccessDialog(null)}
      />
      <SuccessDialog
        open={!!withdrawSuccessDialog}
        data={withdrawSuccessDialog}
        onClose={() => setWithdrawSuccessDialog(null)}
        isWithdraw={true}
      />
      
      <div>
        <h1 className="font-heading font-black text-2xl mb-1">LP Dashboard</h1>
        <p className="text-sm text-muted-foreground">Provide liquidity and earn from losing bets</p>
      </div>

      {/* Connect wallet gate */}
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
        <>
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
                  <Button
                    variant="link"
                    className="p-0 h-auto text-destructive underline ml-2"
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {pendingTx ? (
              <SolanaTransactionSigner
                instruction={pendingTx.instruction}
                amount={pendingTx.amount}
                onSuccess={handleTxSuccess}
                onError={handleTxError}
              />
            ) : (
              <div className="space-y-3">
                {/* Market selector */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Select Market</label>
                  <Select onValueChange={(val) => {
                    const bet = openBets.find(b => b.id === val);
                    setSelectedBet(bet || null);
                    setSelectedOutcome('a');
                    setError(null);
                  }}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 h-11">
                      <SelectValue placeholder="Choose an open market..." />
                    </SelectTrigger>
                    <SelectContent>
                      {openBets.map(bet => (
                        <SelectItem key={bet.id} value={bet.id}>
                          {bet.outcome_a} vs {bet.outcome_b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedBet && (
                  <>
                    {/* Outcome selector */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Select Outcome to Cover (act as the house)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'a', label: selectedBet.outcome_a, odds: selectedBet.odds_a || selectedBet.oracle_odds_a },
                          { key: 'draw', label: 'Draw', odds: selectedBet.odds_draw || selectedBet.oracle_odds_draw },
                          { key: 'b', label: selectedBet.outcome_b, odds: selectedBet.odds_b || selectedBet.oracle_odds_b },
                        ].map(o => {
                          // Handle both basis points (200 = 2.00x) and decimal (2.0 = 2.00x) formats
                          let displayOdds = '—';
                          if (o.odds) {
                            const oddsNum = typeof o.odds === 'string' ? parseFloat(o.odds) : o.odds;
                            // If odds < 10, treat as decimal; otherwise treat as basis points
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

                    {/* LP exposure explainer */}
                    <div className="bg-secondary/40 rounded-xl p-3 text-xs space-y-1.5">
                      <p className="font-bold text-foreground">How Providing Liquidity Works:</p>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          <span className="text-accent font-bold">Your Role:</span> You're acting as the "house" for bettors who want to bet on <span className="text-foreground font-medium">{selectedOutcome === 'a' ? selectedBet.outcome_a : selectedOutcome === 'b' ? selectedBet.outcome_b : 'Draw'}</span>.
                        </p>
                        <p className="text-muted-foreground">
                          <span className="text-accent font-bold">You Commit:</span> ◎{amount || '0'} SOL that gets locked in the market escrow.
                        </p>
                        <p className="text-muted-foreground">
                          <span className="text-green-400 font-bold">You Profit When:</span> Bettors who pick <span className="text-foreground font-medium">{selectedOutcome === 'a' ? selectedBet.outcome_a : selectedOutcome === 'b' ? selectedBet.outcome_b : 'Draw'}</span> <span className="text-destructive font-bold">LOSE</span> → You keep their entire stake as profit.
                        </p>
                        <p className="text-muted-foreground">
                          <span className="text-destructive font-bold">You Lose When:</span> Those bettors <span className="text-green-400 font-bold">WIN</span> → Their fixed-odds payout comes from YOUR committed SOL.
                        </p>
                        <p className="text-muted-foreground">
                          <span className="text-yellow-400 font-bold">Safety Net:</span> Any unmatched SOL is 100% refundable when you withdraw.
                        </p>
                      </div>
                    </div>

                    {/* Amount */}
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
                      {/* Match progress bar */}
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Match rate</span><span>{matchPct}%</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${matchPct}%` }} />
                        </div>
                      </div>
                      
                      {/* Withdraw button for unmatched liquidity */}
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

          {/* History */}
          {myOffers.filter(o => !['open','partially_matched'].includes(o.status)).length > 0 && (
            <section>
              <h2 className="font-heading font-bold text-sm mb-3">History</h2>
              <div className="space-y-2">
                {myOffers.filter(o => !['open','partially_matched'].includes(o.status)).map((offer, i) => (
                  <div key={offer.id} className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-xl">
                    <div>
                      <p className="font-heading font-bold text-sm">{getOutcomeLabel(offer)}</p>
                      <p className="text-xs text-muted-foreground">◎{(offer.amount_matched || 0).toFixed(4)} matched of ◎{(offer.amount_offered || 0).toFixed(4)}</p>
                    </div>
                    <Badge className="text-[10px] bg-secondary text-secondary-foreground">{offer.status}</Badge>
                  </div>
                ))}
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
        </>
      )}
    </div>
  );
}