import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { ArrowLeft, Clock, Trophy, Award, CheckCircle2, Zap, RefreshCw, Wallet, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import OddsPanel from '@/components/betting/OddsPanel';
import OfferBook from '@/components/betting/OfferBook';
import PlaceBetPanel from '@/components/betting/PlaceBetPanel';

import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import LpPositionCard from '@/components/lp/LpPositionCard';
import { useWallet } from '@/lib/WalletContext';
import { getTeamFlag } from '@/utils/flags';

export default function MatchDetail() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { provider } = useWallet();

  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [betMode, setBetMode] = useState('offer');
  const [isRefreshingOdds, setIsRefreshingOdds] = useState(false);

  const [marketCreationTx, setMarketCreationTx] = useState(null);
  const [claimData, setClaimData] = useState(null);
  const [isBatchClaim, setIsBatchClaim] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [pendingLpWithdraw, setPendingLpWithdraw] = useState(null);
  const [lpWithdrawDialog, setLpWithdrawDialog] = useState(null);

  const { data: match } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => base44.entities.Match.list().then((ms) => ms.find((m) => m.id === matchId)),
    enabled: !!matchId
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['betsForMatch', matchId],
    queryFn: () => base44.entities.Bet.filter({ match_id: matchId }),
    enabled: !!matchId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0
  });
  const bet = bets[0] || null;

  const getWalletAddress = () => {
    const s = localStorage.getItem('elevenx_wallet_session');
    if (!s) return null;
    try {const p = JSON.parse(s);return p.address || p;} catch {return s;}
  };

  const { data: myUserBets = [] } = useQuery({
    queryKey: ['myUserBets', matchId, user?.id],
    queryFn: () => base44.entities.UserBet.filter({ match_id: matchId }),
    enabled: !!matchId
  });
  const walletAddress = getWalletAddress();
  // Separate LP positions from matcher bets
  const myLpPositions = myUserBets.filter((ub) =>
    (walletAddress && ub.wallet_address === walletAddress || user?.id && ub.created_by_id === user.id) &&
    ub.role === 'lp'
  );
  const myMatcherBets = myUserBets.filter((ub) =>
    (walletAddress && ub.wallet_address === walletAddress || user?.id && ub.created_by_id === user.id) &&
    ub.role === 'matcher'
  );

  // Calculate won bets and total payout for batch claim (matcher bets only)
  const wonBets = myMatcherBets.filter((ub) => ub.status === 'won');
  const totalBatchPayout = wonBets.reduce((sum, ub) => sum + (ub.actual_payout || ub.potential_payout || 0), 0);

  // Admin: create market with default odds
  const createMarketMutation = useMutation({
    mutationFn: async () => {
      return base44.entities.Bet.create({
        match_id: matchId,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        outcome_draw: 'Draw',
        status: 'open',
        pool_a: 0, pool_b: 0, pool_draw: 0,
        total_pool: 0, total_bettors: 0, fee_percent: 0,
        oracle_odds_a: 200, oracle_odds_draw: 320, oracle_odds_b: 300,
        odds_a: 2.0, odds_draw: 3.2, odds_b: 3.0
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] })
  });



  const settleMutation = useMutation({
    mutationFn: async (outcome) => {
      const res = await base44.functions.invoke('announceWinner', { bet_id: bet.id, winning_outcome: outcome });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
      queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
    },
    onError: (err) => alert('Settle failed: ' + err.message)
  });

  // Batch claim for all won bets on this match
  const batchClaimMutation = useMutation({
    mutationFn: async () => {
      const betIds = wonBets.map((ub) => ub.id);
      const res = await base44.functions.invoke('claimWinnings', { userBetId: betIds[0], batchBetIds: betIds });
      if (res.data.error) throw new Error(res.data.error);
      return { ...res.data, betIds, totalAmount: res.data.totalPayout || totalBatchPayout };
    },
    onSuccess: (data) => {
      setClaimData({ ...data, isBatch: true });
    }
  });

  // Individual claim (legacy - for single bets outside match context)
  const claimMutation = useMutation({
    mutationFn: async (ubId) => {
      const res = await base44.functions.invoke('claimWinnings', { userBetId: ubId });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] })
  });

  const handleBatchClaimClick = () => {
    batchClaimMutation.mutate();
  };

  const handleClaimSignSuccess = async (result) => {
    // Update all claimed bets to 'claimed' status
    const betIdsToUpdate = claimData?.betIds || wonBets.map((ub) => ub.id);
    for (const betId of betIdsToUpdate) {
      await base44.entities.UserBet.update(betId, { status: 'claimed', actual_payout: claimData?.totalPayout || totalBatchPayout });
    }
    setClaimData(null);
    queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
  };

  const handleLpWithdrawSuccess = async (txResult) => {
    const signature = txResult.signature;
    if (pendingLpWithdraw?.userBetId && pendingLpWithdraw?.offerId) {
      try {
        const commitRes = await base44.functions.invoke('finalizeWithdrawal', {
          signature,
          userBetId: pendingLpWithdraw.userBetId,
          offerId: pendingLpWithdraw.offerId
        });
        if (commitRes.data.error) {
          console.error('[MatchDetail] finalizeWithdrawal error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[MatchDetail] finalizeWithdrawal threw:', err);
      }
    }
    setPendingLpWithdraw(null);
    queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
  };

  const handleSelectOffer = (offer) => {
    setSelectedOffer(offer);
    setSelectedOutcome(null);
    setBetMode('match');
  };

  const handleSelectOutcome = (outcome) => {
    setSelectedOutcome(outcome);
    setSelectedOffer(null);
    setBetMode('offer');
  };

  const handleBetSuccess = () => {
    setSelectedOutcome(null);
    setSelectedOffer(null);
  };

  const withdrawMatcherBetMutation = useMutation({
    mutationFn: async (userBetId) => {
      const res = await base44.functions.invoke('withdrawBet', { 
        userBetId,
        walletAddress 
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
      setWithdrawingId(null);
      alert('Bet withdrawn successfully!');
    },
    onError: (err) => {
      alert('Withdraw failed: ' + err.message);
      setWithdrawingId(null);
    }
  });

  if (!match) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  const isAdmin = user?.role === 'admin';
  const hasBet = !!bet;
  const isOpen = bet?.status === 'open';
  const isSettled = bet?.status === 'settled';

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* LP Withdraw Dialog */}
      {lpWithdrawDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
            <h3 className="font-heading font-bold text-lg mb-4">Remove Liquidity</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Withdrawing ◎{lpWithdrawDialog.withdrawAmount?.toFixed(4)} SOL from {lpWithdrawDialog.positionId?.slice(0, 8)}... position
            </p>
            <SolanaTransactionSigner
              instruction={lpWithdrawDialog.solanaInstruction}
              amount={lpWithdrawDialog.withdrawAmount?.toFixed(4) || '0'}
              userBetId={lpWithdrawDialog.positionId}
              offerId={lpWithdrawDialog.offerId}
              onSuccess={handleLpWithdrawSuccess}
              onError={() => setLpWithdrawDialog(null)}
            />
            <Button
              variant="outline"
              onClick={() => setLpWithdrawDialog(null)}
              className="w-full mt-3 h-10 rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to matches
      </Link>

      {/* ── Match Header ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-muted-foreground font-medium">{match.group_stage || 'World Cup 2026'}</span>
          <div className="flex items-center gap-2">
            {match.match_time &&
            <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(match.match_time), 'MMM d · h:mm a')}
              </span>
            }
            <Badge className={`text-[10px] uppercase tracking-wider ${
            match.status === 'live' ? 'bg-destructive/20 text-destructive' :
            match.status === 'finished' ? 'bg-muted text-muted-foreground' :
            'bg-secondary text-secondary-foreground'}`
            }>
              {match.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse mr-1" />}
              {match.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-5xl shadow-lg">
              {getTeamFlag(match.team_a, match.team_a_flag)}
            </div>
            <p className="font-heading font-black text-lg">{match.team_a}</p>
          </div>
          <div className="text-center">
            {match.status === 'finished' || match.status === 'live' ?
            <div className="flex items-center gap-3">
                <span className="text-4xl font-heading font-bold">{match.score_a ?? 0}</span>
                <span className="text-muted-foreground text-xl">-</span>
                <span className="text-4xl font-heading font-bold">{match.score_b ?? 0}</span>
              </div> :

            <span className="text-sm font-bold text-primary bg-primary/10 px-4 py-2 rounded-full">VS</span>
            }
          </div>
          <div className="flex-1 text-center">
            <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 flex items-center justify-center text-5xl shadow-lg">
              {getTeamFlag(match.team_b, match.team_b_flag)}
            </div>
            <p className="font-heading font-black text-lg">{match.team_b}</p>
          </div>
        </div>
      </motion.div>

      {/* ── No market (admin) ── */}
      {!hasBet && isAdmin &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-primary/20 rounded-2xl p-5 text-center">
          <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="font-heading font-bold mb-1">Open Betting Market</h3>
          <p className="text-xs text-muted-foreground mb-4">Create the P2P fixed-odds market for this match</p>
          <Button onClick={() => createMarketMutation.mutate()}
        disabled={createMarketMutation.isPending}
        className="bg-primary hover:bg-primary/90 font-heading font-bold h-11 rounded-xl px-8">
            {createMarketMutation.isPending ? 'Opening...' : 'Open Market'}
          </Button>
        </motion.div>
      }

      {/* ── Admin: Create Market On-Chain ── */}
      {hasBet && isAdmin && isOpen &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-primary/20 rounded-2xl p-5 text-center">
          <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="font-heading font-bold mb-1">
            {bet.solana_market_created ? 'Market On-Chain ✓' : 'Create Market On-Chain'}
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {bet.solana_market_created ?
          `Market initialized at ${bet.solana_market_pda?.slice(0, 20)}...` :
          'Initialize the pari-mutuel market on Solana'}
          </p>
          {!bet.solana_market_created && !marketCreationTx &&
        <Button onClick={async () => {
          const res = await base44.functions.invoke('createMarketOnChain', { bet_id: bet.id, match_id: match.id });
          if (res.data.error) {
            alert('Error: ' + res.data.error);
          } else if (res.data.alreadyExists) {
            await base44.entities.Bet.update(bet.id, {
              solana_market_created: true,
              solana_market_pda: res.data.marketPda
            });
            alert('Market already exists on-chain!');
            queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
          } else {
            setMarketCreationTx(res.data.solana_instruction);
          }
        }}
        className="bg-primary hover:bg-primary/90 font-heading font-bold h-11 rounded-xl px-8">
              Prepare Transaction
            </Button>
        }
          {!bet.solana_market_created && marketCreationTx &&
        <SolanaTransactionSigner
          instruction={marketCreationTx}
          amount={0}
          isConnected={!!provider}
          onSuccess={async () => {
            await base44.entities.Bet.update(bet.id, {
              solana_market_created: true,
              solana_market_pda: marketCreationTx.accounts.market
            });
            alert('Market created on-chain!');
            setMarketCreationTx(null);
            queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
          }}
          onError={(err) => alert('Failed: ' + err.message)} />

        }
          {bet.solana_market_created ?
        <div className="flex items-center justify-center gap-2">
              <Badge className="bg-accent/20 text-accent text-xs py-2 px-4 rounded-xl">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Initialized
              </Badge>
              <Button size="sm" variant="outline" onClick={async () => {
            const res = await base44.functions.invoke('checkMarketStatus', { match_id: match.id });
            if (res.data.status === 'initialized') {
              await base44.entities.Bet.update(bet.id, {
                solana_market_created: true,
                solana_market_pda: res.data.marketPda || bet.solana_market_pda
              });
              alert('Status synced with blockchain!');
              queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
            } else {
              alert('Market not found on-chain. Please create it.');
            }
          }} className="h-8 text-xs rounded-lg">
                Sync Status
              </Button>
            </div> :
        null}
        </motion.div>
      }

      {!hasBet && !isAdmin &&
      <div className="text-center py-10 bg-card border border-border/50 rounded-2xl">
          <p className="text-muted-foreground text-sm">Betting market not open yet. Check back soon!</p>
        </div>
      }



      {/* ── Odds Panel ── */}
      {hasBet &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OddsPanel
          bet={bet}
          match={match}
          selectedOutcome={betMode === 'offer' ? selectedOutcome : null}
          onSelectOutcome={isOpen ? handleSelectOutcome : undefined}

          isRefreshing={isRefreshingOdds} />
        
        </motion.div>
      }

      {/* ── Bet Panel ── */}
      {hasBet && isOpen && (selectedOutcome || selectedOffer) &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={betMode + selectedOutcome + selectedOffer?.id}>
          <PlaceBetPanel
          bet={bet}
          matchId={matchId}
          mode={betMode}
          selectedOutcome={selectedOutcome}
          selectedOffer={selectedOffer}
          onSuccess={handleBetSuccess} />
        
        </motion.div>
      }

      {hasBet && isOpen && !selectedOutcome && !selectedOffer &&
      <p className="text-center text-xs text-muted-foreground py-2">
          Pick an outcome above to place your own offer, or click "Bet Against" on an open offer below
        </p>
      }

      {/* ── Open Offer Book ── */}
      {hasBet &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <OfferBook betId={bet.id} bet={bet} onSelectOffer={isOpen ? handleSelectOffer : undefined} />
        </motion.div>
      }

      {/* ── Admin: Settle ── */}
      {hasBet && isAdmin && !isSettled && (match.status === 'finished' || isOpen) &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-accent/20 rounded-2xl p-5">
          <div className="text-center mb-4">
            <Trophy className="w-8 h-8 text-accent mx-auto mb-2" />
            <h3 className="font-heading font-bold mb-1">Settle Market</h3>
            <p className="text-xs text-muted-foreground">Select the winner — all matched bets will be settled</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['a', 'b', 'draw'].map((outcome) =>
          <Button key={outcome}
          onClick={() => {
            const label = outcome === 'draw' ? 'Draw' : outcome === 'a' ? bet.outcome_a : bet.outcome_b;
            if (confirm(`Settle as ${label}?`)) settleMutation.mutate(outcome);
          }}
          disabled={settleMutation.isPending}
          className={`h-10 font-heading font-bold text-xs rounded-xl ${
          outcome === 'a' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' :
          outcome === 'b' ? 'bg-accent hover:bg-accent/90 text-accent-foreground' :
          'bg-yellow-500 hover:bg-yellow-500/90 text-white'}`
          }>
                {outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw'}
              </Button>
          )}
          </div>
        </motion.div>
      }

      {/* ── Settled ── */}
      {hasBet && isSettled &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-accent/20 rounded-2xl p-5 text-center">
          <CheckCircle2 className="w-8 h-8 text-accent mx-auto mb-2" />
          <h3 className="font-heading font-bold mb-1">Market Settled</h3>
          <p className="text-sm text-accent font-bold">
            Winner: {bet.winning_outcome === 'a' ? bet.outcome_a : bet.winning_outcome === 'b' ? bet.outcome_b : 'Draw'}
          </p>
        </motion.div>
      }

      {/* ── My Liquidity Positions (LP ONLY) ── */}
      {myLpPositions.length > 0 &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-primary/20 rounded-2xl p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> My Liquidity Positions
          </h3>
          <p className="text-xs text-muted-foreground">
            Provided liquidity to earn fees from betting activity
          </p>
          
          <div className="space-y-3">
            {myLpPositions.map((lp, i) => (
              <LpPositionCard
                key={lp.id}
                position={lp}
                index={i}
                walletAddress={walletAddress}
                onWithdrawRequest={(data) => setLpWithdrawDialog(data)}
              />
            ))}
          </div>
        </motion.div>
      }

      {/* ── My Bets (Matcher ONLY) ── */}
      {myMatcherBets.length > 0 &&
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-accent/20 rounded-2xl p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-accent" /> My Bets
          </h3>
          <p className="text-xs text-muted-foreground">
            Active and settled bets on this match
          </p>
          
          {/* Batch Claim Button for Won Bets */}
          {wonBets.length > 0 &&
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-accent">Claim All Winnings</p>
                  <p className="text-xs text-muted-foreground">{wonBets.length} bet(s) on this match</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-accent">◎{totalBatchPayout.toFixed(4)}</p>
                  <p className="text-[10px] text-muted-foreground">Total payout</p>
                </div>
              </div>
              
              {claimData?.isBatch ?
          <SolanaTransactionSigner
            instruction={claimData.solana_instruction}
            amount={claimData.totalAmount?.toFixed(4) || totalBatchPayout.toFixed(4)}
            userBetId={claimData.betIds[0]}
            batchBetIds={claimData.betIds}
            onSuccess={handleClaimSignSuccess}
            onError={() => setClaimData(null)} /> :


          <Button
            onClick={handleBatchClaimClick}
            disabled={batchClaimMutation.isPending}
            className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-xl text-sm">
            
                  {batchClaimMutation.isPending ?
            <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" /> :

            <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Claim All ({wonBets.length} bets)
                    </>
            }
                </Button>
          }
            </div>
        }
          
          <div className="space-y-3">
            {myMatcherBets.map((ub) => (
              <div key={ub.id} className="bg-secondary/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{ub.outcome_label}</span>
                    <Badge className={`text-[9px] py-0 ${
                ub.status === 'active' ? 'bg-accent/20 text-accent' :
                ub.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                ub.status === 'won' ? 'bg-accent/30 text-accent' :
                ub.status === 'lost' ? 'bg-destructive/20 text-destructive' :
                ub.status === 'refunded' ? 'bg-secondary text-secondary-foreground' :
                'bg-muted text-muted-foreground'}`
                }>{ub.status}</Badge>
                    <Badge className="text-[9px] py-0 bg-accent/10 text-accent">Bet</Badge>
                  </div>
                  <span className="font-bold">◎{ub.amount?.toFixed(4)}</span>
                </div>
                {ub.potential_payout > 0 &&
            <p className="text-xs text-muted-foreground">
                    Payout if win: <span className="text-accent font-bold">◎{ub.potential_payout?.toFixed(4)}</span>
                  </p>
            }
                {ub.status === 'pending' &&
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                  <p className="text-[10px] text-yellow-400">⏳ Waiting to be matched</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => withdrawMatcherBetMutation.mutate(ub.id)}
                    disabled={withdrawMatcherBetMutation.isPending}
                    className="h-7 text-xs rounded-lg">
                    {withdrawMatcherBetMutation.isPending ? 'Withdrawing...' : 'Withdraw'}
                  </Button>
                </div>
            }
                {ub.status === 'won' &&
            <p className="text-xs text-accent mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Included in batch claim above
                  </p>
            }
              </div>
            ))}
          </div>
        </motion.div>
      }
    </div>);

}