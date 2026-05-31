import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { ArrowLeft, Clock, Trophy, Wallet, TrendingUp, Users, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// ── Odds helpers ──────────────────────────────────────────────────────────────
// For a bettor picking side X:
//   available coverage = LP on the OTHER side − already backed on X
//   their max bet = that coverage
//   if they put $S on X, they can win $S * (lpOther / backedX_new)
// We use a simple fixed-odds model per LP ratio:
//   odds for A = (lp_b) / (lp_a)  → if lp_a=100, lp_b=100 → 1:1 (win same)
//   bettor on A can win: stake * (lp_b / lp_a)  (from LP-B pool)
//   max stake on A = lp_b − backed_a  (can't exceed coverage)

function calcOdds(lpA, lpB) {
  if (!lpA || !lpA > 0) return { oddsA: null, oddsB: null };
  const oddsA = lpA > 0 && lpB > 0 ? (lpA / lpB) : 1; // bettor A wins oddsA * stake from LP-B side
  const oddsB = lpA > 0 && lpB > 0 ? (lpB / lpA) : 1;
  return { oddsA, oddsB };
}

function maxBet(lpOtherSide, backedThisSide) {
  return Math.max(0, (lpOtherSide || 0) - (backedThisSide || 0));
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const { isConnected, connect, shortAddress } = useWallet();
  const queryClient = useQueryClient();
  const [selectedOutcome, setSelectedOutcome] = useState(null); // 'a' | 'b'
  const [amount, setAmount] = useState('');
  const quickAmounts = [10, 25, 50, 100, 250];

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

  const { data: myBets = [] } = useQuery({
    queryKey: ['myBetsForMatch', matchId],
    queryFn: () => base44.entities.UserBet.filter({ match_id: matchId }),
    enabled: !!matchId && !!user,
  });
  const myBet = myBets.find(ub => ub.created_by_id === user?.id);

  const { data: allUserBets = [] } = useQuery({
    queryKey: ['allUserBetsForBet', bet?.id],
    queryFn: () => base44.entities.UserBet.filter({ bet_id: bet.id }),
    enabled: !!bet?.id,
  });

  // ── LP Seed Mutation (admin only — auto-creates bet with LP) ────────────────
  const seedMutation = useMutation({
    mutationFn: async ({ lpA, lpB }) => {
      await base44.entities.Bet.create({
        match_id: matchId,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        status: 'open',
        lp_amount_a: lpA,
        lp_amount_b: lpB,
        backed_amount_a: 0,
        backed_amount_b: 0,
        total_pool: lpA + lpB,
        total_bettors: 0,
        fee_percent: 200,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
    },
  });

  // ── Place Bet Mutation ──────────────────────────────────────────────────────
  const placeBetMutation = useMutation({
    mutationFn: async (stakeAmount) => {
      if (!bet) return;
      const isA = selectedOutcome === 'a';
      const lpCoverage = isA ? bet.lp_amount_b : bet.lp_amount_a;
      const alreadyBacked = isA ? (bet.backed_amount_a || 0) : (bet.backed_amount_b || 0);
      const available = lpCoverage - alreadyBacked;
      if (stakeAmount > available) throw new Error('Exceeds available coverage');

      const winAmount = isA
        ? stakeAmount * ((bet.lp_amount_a || 0) / (bet.lp_amount_b || 1))
        : stakeAmount * ((bet.lp_amount_b || 0) / (bet.lp_amount_a || 1));
      const fee = winAmount * (bet.fee_percent || 200) / 10000;
      const potentialPayout = stakeAmount + winAmount - fee;

      await base44.entities.UserBet.create({
        bet_id: bet.id,
        match_id: matchId,
        outcome: selectedOutcome,
        amount: stakeAmount,
        potential_payout: potentialPayout,
        outcome_label: isA ? bet.outcome_a : bet.outcome_b,
        match_title: `${match.team_a} vs ${match.team_b}`,
        status: 'active',
      });

      const updates = {
        total_bettors: (bet.total_bettors || 0) + 1,
        total_pool: (bet.total_pool || 0) + stakeAmount,
      };
      if (isA) updates.backed_amount_a = alreadyBacked + stakeAmount;
      else updates.backed_amount_b = alreadyBacked + stakeAmount;
      await base44.entities.Bet.update(bet.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
      queryClient.invalidateQueries({ queryKey: ['myBetsForMatch', matchId] });
      queryClient.invalidateQueries({ queryKey: ['allUserBetsForBet', bet?.id] });
      setSelectedOutcome(null);
      setAmount('');
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.UserBet.update(myBet.id, { status: 'claimed' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myBetsForMatch', matchId] }),
  });

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

  // Odds
  const lpA = bet?.lp_amount_a || 0;
  const lpB = bet?.lp_amount_b || 0;
  const backedA = bet?.backed_amount_a || 0;
  const backedB = bet?.backed_amount_b || 0;

  // For bettors:
  // Bet on A → you're matched against LP-A pool, you win from LP-A
  // odds displayed: "bet $1 → win $X"  where X = lp_a/lp_b
  const oddsForA = lpB > 0 ? (lpA / lpB) : 1; // e.g. lp_a=200,lp_b=100 → A wins 2x
  const oddsForB = lpA > 0 ? (lpB / lpA) : 1;
  const maxBetA = Math.max(0, lpA - backedA); // coverage from LP-A for people betting on A
  const maxBetB = Math.max(0, lpB - backedB);

  const stakeNum = parseFloat(amount) || 0;
  const isPickingA = selectedOutcome === 'a';
  const currentOdds = isPickingA ? oddsForA : oddsForB;
  const currentMax = isPickingA ? maxBetA : maxBetB;
  const winnings = stakeNum * currentOdds;
  const fee = winnings * (bet?.fee_percent || 200) / 10000;
  const netWin = winnings - fee;
  const totalPayout = stakeNum + netWin;

  const lpPct = lpA + lpB > 0 ? (lpA / (lpA + lpB)) * 100 : 50;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to matches
      </Link>

      {/* ── Match Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-2xl p-6"
      >
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

        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 text-center">
            <div className="text-5xl mb-3">{match.team_a_flag || '🏳️'}</div>
            <p className="font-heading font-black text-lg">{match.team_a}</p>
            {hasBet && (
              <div className="mt-2 inline-flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                <span className="text-xs font-bold text-primary">{oddsForA.toFixed(2)}x odds</span>
              </div>
            )}
          </div>
          <div className="text-center px-4">
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
            {hasBet && (
              <div className="mt-2 inline-flex items-center gap-1 bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
                <span className="text-xs font-bold text-accent">{oddsForB.toFixed(2)}x odds</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── No Bet Yet — Admin Seeds LP ── */}
      {!hasBet && isAdmin && (
        <SeedLiquidityPanel match={match} onSeed={({ lpA, lpB }) => seedMutation.mutate({ lpA, lpB })} isSeeding={seedMutation.isPending} />
      )}
      {!hasBet && !isAdmin && (
        <div className="text-center py-12 bg-card border border-border/50 rounded-2xl">
          <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Betting pool not yet available for this match</p>
        </div>
      )}

      {/* ── Bet Pool Stats ── */}
      {hasBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Pool Overview
            </h3>
            <Badge className={`text-[10px] ${isOpen ? 'bg-accent/20 text-accent' : 'bg-secondary text-secondary-foreground'}`}>
              {bet.status}
            </Badge>
          </div>

          {/* Odds bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{match.team_a}</span>
              <span>{match.team_b}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-secondary flex">
              <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${lpPct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] mt-1">
              <span className="text-primary font-bold">{lpA > 0 ? ((lpA/(lpA+lpB))*100).toFixed(0) : 50}% LP</span>
              <span className="text-accent font-bold">{lpB > 0 ? ((lpB/(lpA+lpB))*100).toFixed(0) : 50}% LP</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-secondary/40 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground mb-1">LP Pool</p>
              <p className="font-heading font-bold text-sm">${(lpA + lpB).toLocaleString()}</p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Bettor Stakes</p>
              <p className="font-heading font-bold text-sm">${(backedA + backedB).toLocaleString()}</p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Bettors</p>
              <p className="font-heading font-bold text-sm flex items-center justify-center gap-1">
                <Users className="w-3 h-3" />{bet.total_bettors || 0}
              </p>
            </div>
          </div>

          {/* Coverage remaining */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Max bet on {match.team_a}</p>
              <p className="font-heading font-bold text-primary text-sm">${maxBetA.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">coverage left</p>
            </div>
            <div className="bg-accent/5 border border-accent/15 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Max bet on {match.team_b}</p>
              <p className="font-heading font-bold text-accent text-sm">${maxBetB.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">coverage left</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── My Existing Bet ── */}
      {myBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-primary/20 rounded-2xl p-5">
          <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            {myBet.status === 'won' || myBet.status === 'claimed' ? <CheckCircle2 className="w-4 h-4 text-accent" /> :
             myBet.status === 'lost' ? <XCircle className="w-4 h-4 text-destructive" /> :
             <Trophy className="w-4 h-4 text-primary" />}
            Your Active Bet
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Pick</p>
              <p className="font-bold text-primary">{myBet.outcome_label}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Stake</p>
              <p className="font-bold">${myBet.amount?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">If win</p>
              <p className="font-bold text-accent">${myBet.potential_payout?.toFixed(2)}</p>
            </div>
          </div>
          {myBet.status === 'won' && (
            <Button onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending}
              className="w-full mt-4 bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold h-11 rounded-xl">
              Claim ${myBet.actual_payout?.toFixed(2) || myBet.potential_payout?.toFixed(2)}
            </Button>
          )}
        </motion.div>
      )}

      {/* ── Wallet Gate ── */}
      {hasBet && isOpen && !myBet && !isConnected && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-2xl border border-primary/20 p-7 text-center"
          style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}>
          <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-heading font-black text-xl text-white mb-2">Connect to Bet</h3>
          <p className="text-white/50 text-sm mb-5 max-w-xs mx-auto">Connect your Phantom wallet to place a bet.</p>
          <Button onClick={connect} className="font-heading font-bold px-8 h-11 rounded-xl text-sm"
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)', boxShadow: '0 0 24px rgba(166,156,242,0.3)' }}>
            <Wallet className="w-4 h-4 mr-2" /> Connect Phantom Wallet
          </Button>
        </motion.div>
      )}

      {/* ── Bet Slip ── */}
      {hasBet && isOpen && !myBet && isConnected && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-primary/20 rounded-2xl p-5">
          <h3 className="font-heading font-bold text-sm mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Place Your Bet
          </h3>

          {/* Pick outcome */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { side: 'a', team: match.team_a, flag: match.team_a_flag, odds: oddsForA, maxB: maxBetA, color: 'primary' },
              { side: 'b', team: match.team_b, flag: match.team_b_flag, odds: oddsForB, maxB: maxBetB, color: 'accent' },
            ].map(({ side, team, flag, odds, maxB, color }) => (
              <button key={side}
                onClick={() => { setSelectedOutcome(side); setAmount(''); }}
                disabled={maxB <= 0}
                className={`rounded-xl p-4 border-2 text-center transition-all duration-200 ${
                  selectedOutcome === side
                    ? color === 'primary' ? 'border-primary bg-primary/10' : 'border-accent bg-accent/10'
                    : 'border-border/50 bg-secondary/30 hover:border-border'
                } disabled:opacity-40 disabled:cursor-not-allowed`}>
                <div className="text-3xl mb-1">{flag || '🏳️'}</div>
                <p className="font-heading font-bold text-sm">{team}</p>
                <p className={`text-xs font-bold mt-1 ${color === 'primary' ? 'text-primary' : 'text-accent'}`}>
                  {odds.toFixed(2)}x · max ${maxB.toFixed(0)}
                </p>
                {maxB <= 0 && <p className="text-[10px] text-muted-foreground mt-1">Pool full</p>}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {selectedOutcome && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="mb-3">
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Stake amount (max ${currentMax.toFixed(2)})
                  </label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    min={0}
                    max={currentMax}
                    onChange={e => setAmount(Math.min(parseFloat(e.target.value) || 0, currentMax).toString())}
                    className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12"
                  />
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  {quickAmounts.filter(q => q <= currentMax).map(qa => (
                    <button key={qa} onClick={() => setAmount(String(qa))}
                      className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
                      ${qa}
                    </button>
                  ))}
                  <button onClick={() => setAmount(currentMax.toFixed(2))}
                    className="px-3 py-1.5 text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors">
                    MAX
                  </button>
                </div>

                {stakeNum > 0 && (
                  <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your stake</span>
                      <span className="font-bold">${stakeNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Winnings if correct</span>
                      <span className="font-bold text-accent">+${netWin.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-border/30" />
                    <div className="flex justify-between text-sm font-bold">
                      <span>Total payout</span>
                      <span className="text-accent text-lg">${totalPayout.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Odds</span>
                      <span>{currentOdds.toFixed(2)}x &nbsp;·&nbsp; 2% fee included</span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => placeBetMutation.mutate(stakeNum)}
                  disabled={stakeNum <= 0 || stakeNum > currentMax || placeBetMutation.isPending}
                  className="w-full h-12 font-heading font-bold text-base bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                  {placeBetMutation.isPending
                    ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    : `Bet $${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'} on ${selectedOutcome === 'a' ? match.team_a : match.team_b}`}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center mt-2">{shortAddress} · Bets are final</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {hasBet && !isOpen && !myBet && (
        <div className="text-center py-8 bg-card border border-border/50 rounded-2xl">
          <p className="text-muted-foreground text-sm">
            {isSettled ? 'This bet has been settled.' : 'Betting is closed.'}
          </p>
        </div>
      )}

      {/* ── Recent Bets List ── */}
      {allUserBets.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" /> Recent Bets
          </h3>
          <div className="space-y-2">
            {allUserBets.slice(0, 8).map(ub => (
              <div key={ub.id} className="flex items-center justify-between text-xs py-2 border-b border-border/20 last:border-0">
                <span className="text-muted-foreground">{ub.outcome_label}</span>
                <span className="font-bold">${ub.amount?.toFixed(2)}</span>
                <span className="text-accent font-medium">→ ${ub.potential_payout?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Admin LP Seed Panel ───────────────────────────────────────────────────────
function SeedLiquidityPanel({ match, onSeed, isSeeding }) {
  const [lpA, setLpA] = useState('100');
  const [lpB, setLpB] = useState('100');

  const lpANum = parseFloat(lpA) || 0;
  const lpBNum = parseFloat(lpB) || 0;
  const oddsA = lpBNum > 0 ? (lpANum / lpBNum) : 1;
  const oddsB = lpANum > 0 ? (lpBNum / lpANum) : 1;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-primary/20 rounded-2xl p-5">
      <h3 className="font-heading font-bold text-sm mb-1 flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" /> Seed Liquidity Pool (Admin)
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Set the initial LP amounts. Bettors can only bet up to the coverage you provide on each side.
        Odds are determined by LP ratio (e.g. LP-A=$200, LP-B=$100 → Team A pays 2x, Team B pays 0.5x).
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{match.team_a} LP ($)</label>
          <Input value={lpA} onChange={e => setLpA(e.target.value)} type="number" className="bg-secondary/50 h-10" />
          <p className="text-[10px] text-primary mt-1">→ bettors on {match.team_a} win {oddsA.toFixed(2)}x</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{match.team_b} LP ($)</label>
          <Input value={lpB} onChange={e => setLpB(e.target.value)} type="number" className="bg-secondary/50 h-10" />
          <p className="text-[10px] text-accent mt-1">→ bettors on {match.team_b} win {oddsB.toFixed(2)}x</p>
        </div>
      </div>
      <Button onClick={() => onSeed({ lpA: lpANum, lpB: lpBNum })} disabled={isSeeding || lpANum <= 0 || lpBNum <= 0}
        className="w-full h-11 font-heading font-bold bg-primary hover:bg-primary/90 rounded-xl">
        {isSeeding ? 'Opening Pool...' : `Open Betting Pool · $${(lpANum + lpBNum).toFixed(0)} total liquidity`}
      </Button>
    </motion.div>
  );
}