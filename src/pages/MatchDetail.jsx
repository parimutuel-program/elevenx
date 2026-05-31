import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { ArrowLeft, Clock, Trophy, TrendingUp, Users, Zap, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import OfferBook from '@/components/betting/OfferBook';

// ── Odds calculation from live offer pools ────────────────────────────────────
function calcImpliedOdds(lpA, lpB, lpDraw) {
  const total = lpA + lpB + lpDraw;
  if (total === 0) return { oddsA: 1, oddsB: 1, oddsDraw: 1 };
  const oddsA = lpA > 0 ? (lpB + lpDraw) / lpA : 0;
  const oddsB = lpB > 0 ? (lpA + lpDraw) / lpB : 0;
  const oddsDraw = lpDraw > 0 ? (lpA + lpB) / lpDraw : 0;
  return { oddsA, oddsB, oddsDraw };
}

function totalAvailable(offers, outcome) {
  return offers
    .filter(o => o.outcome === outcome && (o.status === 'open' || o.status === 'partially_matched'))
    .reduce((s, o) => s + (o.amount_unmatched || 0), 0);
}

const QUICK_AMOUNTS = [10, 25, 50, 100, 250];
const FEE_BPS = 200;

export default function MatchDetail() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [amount, setAmount] = useState('');
  const [matchingOffer, setMatchingOffer] = useState(null);

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
      await base44.entities.BetOffer.create({
        bet_id: bet.id,
        match_id: matchId,
        outcome,
        outcome_label: offerOutcomeLabel,
        amount_offered: offerAmount,
        amount_matched: 0,
        amount_unmatched: offerAmount,
        status: 'open',
      });
      const lpField = outcome === 'a' ? 'lp_amount_a' : outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
      await base44.entities.Bet.update(bet.id, {
        [lpField]: (bet[lpField] || 0) + offerAmount,
      });
      await base44.entities.UserBet.create({
        bet_id: bet.id,
        match_id: matchId,
        outcome,
        amount: offerAmount,
        role: 'lp',
        status: 'pending',
        outcome_label: offerOutcomeLabel,
        match_title: `${match.team_a} vs ${match.team_b}`,
        potential_payout: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offersForBet', bet?.id] });
      queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
      queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
      resetForm();
    },
  });

  const matchOfferMutation = useMutation({
    mutationFn: async ({ offer, matchAmount }) => {
      const matcherOutcome = selectedOutcome;
      const matcherLabel = getOutcomeLabel(matcherOutcome);
      const { oddsA, oddsB, oddsDraw } = calcImpliedOdds(
        totalAvailable(offers, 'a'),
        totalAvailable(offers, 'b'),
        totalAvailable(offers, 'draw')
      );
      const currentOdds = matcherOutcome === 'a' ? oddsA : matcherOutcome === 'b' ? oddsB : oddsDraw;
      const winnings = matchAmount * currentOdds;
      const fee = winnings * FEE_BPS / 10000;
      const potentialPayout = matchAmount + winnings - fee;

      const newMatched = (offer.amount_matched || 0) + matchAmount;
      const newUnmatched = offer.amount_offered - newMatched;
      const newStatus = newUnmatched <= 0.01 ? 'fully_matched' : 'partially_matched';
      await base44.entities.BetOffer.update(offer.id, {
        amount_matched: newMatched,
        amount_unmatched: Math.max(0, newUnmatched),
        status: newStatus,
      });

      await base44.entities.UserBet.create({
        bet_id: bet.id,
        match_id: matchId,
        offer_id: offer.id,
        outcome: matcherOutcome,
        amount: matchAmount,
        role: 'matcher',
        status: 'active',
        outcome_label: matcherLabel,
        match_title: `${match.team_a} vs ${match.team_b}`,
        potential_payout: potentialPayout,
      });

      const lpBets = await base44.entities.UserBet.filter({ offer_id: offer.id, role: 'lp' });
      if (lpBets.length > 0) {
        const lpWin = matchAmount;
        const lpFee = lpWin * FEE_BPS / 10000;
        const lpPayout = offer.amount_offered + lpWin - lpFee;
        await base44.entities.UserBet.update(lpBets[0].id, {
          status: 'active',
          potential_payout: lpPayout,
        });
      }

      const backedField = matcherOutcome === 'a' ? 'backed_amount_a' : matcherOutcome === 'b' ? 'backed_amount_b' : 'backed_amount_draw';
      await base44.entities.Bet.update(bet.id, {
        [backedField]: (bet[backedField] || 0) + matchAmount,
        total_pool: (bet.total_pool || 0) + matchAmount,
        total_bettors: (bet.total_bettors || 0) + 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offersForBet', bet?.id] });
      queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
      queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['allUserBetsForBet', bet?.id] });
      resetForm();
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (ubId) => {
      await base44.entities.UserBet.update(ubId, { status: 'claimed' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] }),
  });

  function resetForm() {
    setMode(null); setSelectedOutcome(null); setAmount(''); setMatchingOffer(null);
  }

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
  const { oddsA, oddsB, oddsDraw } = calcImpliedOdds(avA, avB, avDraw);
  const totalLiquidity = avA + avB + avDraw;

  const stakeNum = parseFloat(amount) || 0;
  const matchOdds = selectedOutcome === 'a' ? oddsA : selectedOutcome === 'b' ? oddsB : oddsDraw;
  const matchMax = matchingOffer
    ? matchingOffer.amount_unmatched
    : (selectedOutcome === 'a' ? avA : selectedOutcome === 'b' ? avB : avDraw);
  const matchWin = stakeNum * matchOdds;
  const matchFee = matchWin * FEE_BPS / 10000;
  const matchPayout = stakeNum + matchWin - matchFee;

  const OUTCOMES = [
    { key: 'a', label: bet?.outcome_a || match.team_a, flag: match.team_a_flag, odds: oddsA, available: avA, color: 'primary' },
    { key: 'draw', label: 'Draw', flag: '🤝', odds: oddsDraw, available: avDraw, color: 'yellow' },
    { key: 'b', label: bet?.outcome_b || match.team_b, flag: match.team_b_flag, odds: oddsB, available: avB, color: 'accent' },
  ];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to matches
      </Link>

      {/* Match Header */}
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
            {hasBet && avA > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                <span className="text-xs font-bold text-primary">{oddsA.toFixed(2)}x</span>
              </div>
            )}
          </div>
          <div className="text-center flex flex-col items-center gap-2">
            {match.status === 'finished' || match.status === 'live' ? (
              <div className="flex items-center gap-3">
                <span className="text-4xl font-heading font-bold">{match.score_a ?? 0}</span>
                <span className="text-muted-foreground text-xl">-</span>
                <span className="text-4xl font-heading font-bold">{match.score_b ?? 0}</span>
              </div>
            ) : (
              <span className="text-sm font-bold text-primary bg-primary/10 px-4 py-2 rounded-full">VS</span>
            )}
            {hasBet && avDraw > 0 && (
              <div className="inline-flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2 py-0.5">
                <span className="text-[10px] font-bold text-yellow-400">Draw {oddsDraw.toFixed(2)}x</span>
              </div>
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="text-5xl mb-3">{match.team_b_flag || '🏳️'}</div>
            <p className="font-heading font-black text-lg">{match.team_b}</p>
            {hasBet && avB > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
                <span className="text-xs font-bold text-accent">{oddsB.toFixed(2)}x</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* No market yet */}
      {!hasBet && isAdmin && (
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
      {!hasBet && !isAdmin && (
        <div className="text-center py-12 bg-card border border-border/50 rounded-2xl">
          <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Betting market not yet open for this match</p>
        </div>
      )}

      {/* Pool overview */}
      {hasBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Live Market
            </h3>
            <div className="flex items-center gap-2">
              <Badge className={`text-[10px] ${isOpen ? 'bg-accent/20 text-accent' : 'bg-secondary text-secondary-foreground'}`}>
                {bet.status}
              </Badge>
              <span className="text-xs text-muted-foreground">${totalLiquidity.toLocaleString()} available</span>
            </div>
          </div>

          {totalLiquidity > 0 && (
            <div>
              <div className="h-3 rounded-full overflow-hidden bg-secondary flex gap-0.5">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(avA / totalLiquidity) * 100}%` }} />
                <div className="h-full bg-yellow-500 transition-all duration-500" style={{ width: `${(avDraw / totalLiquidity) * 100}%` }} />
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(avB / totalLiquidity) * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1.5">
                <span className="text-primary font-bold">{match.team_a} {oddsA > 0 ? `${oddsA.toFixed(2)}x` : '—'}</span>
                <span className="text-yellow-400 font-bold">Draw {oddsDraw > 0 ? `${oddsDraw.toFixed(2)}x` : '—'}</span>
                <span className="text-accent font-bold">{match.team_b} {oddsB > 0 ? `${oddsB.toFixed(2)}x` : '—'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            {OUTCOMES.map(o => (
              <div key={o.key} className="bg-secondary/40 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground mb-0.5">{o.label}</p>
                <p className={`font-heading font-bold text-sm ${
                  o.color === 'primary' ? 'text-primary' : o.color === 'accent' ? 'text-accent' : 'text-yellow-400'
                }`}>${o.available.toFixed(0)}</p>
                <p className="text-[9px] text-muted-foreground">available</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Offer Book */}
      {hasBet && isOpen && offers.some(o => o.status === 'open' || o.status === 'partially_matched') && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" /> Open Offers
          </h3>
          {OUTCOMES.map(o => {
            const oOffers = offers.filter(of => of.outcome === o.key && (of.status === 'open' || of.status === 'partially_matched'));
            if (oOffers.length === 0) return null;
            return (
              <div key={o.key}>
                <p className={`text-xs font-bold mb-2 ${
                  o.color === 'primary' ? 'text-primary' : o.color === 'accent' ? 'text-accent' : 'text-yellow-400'
                }`}>{o.label}</p>
                <OfferBook
                  offers={oOffers}
                  outcome={o.key}
                  outcomeLabel={o.label}
                  color={o.color}
                  canMatch={!!user && isOpen}
                  onMatch={(offer) => {
                    setMatchingOffer(offer);
                    setMode('match');
                    const opp = offer.outcome === 'a' ? 'b' : offer.outcome === 'b' ? 'a' : 'a';
                    setSelectedOutcome(opp);
                    setAmount('');
                  }}
                />
              </div>
            );
          })}
        </motion.div>
      )}

      {/* My Positions */}
      {myActiveBets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-primary/20 rounded-2xl p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> My Positions
          </h3>
          {myActiveBets.map(ub => (
            <div key={ub.id} className="bg-secondary/30 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {ub.status === 'won' || ub.status === 'claimed' ? <CheckCircle2 className="w-3.5 h-3.5 text-accent" /> :
                   ub.status === 'lost' ? <XCircle className="w-3.5 h-3.5 text-destructive" /> :
                   <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                  <span className="font-bold text-xs text-primary">{ub.outcome_label}</span>
                  <Badge className={`text-[9px] py-0 ${
                    ub.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                    ub.status === 'active' ? 'bg-accent/20 text-accent' :
                    ub.status === 'won' ? 'bg-accent/30 text-accent' :
                    ub.status === 'lost' ? 'bg-destructive/20 text-destructive' :
                    'bg-secondary text-secondary-foreground'
                  }`}>
                    {ub.status === 'pending' && ub.role === 'lp' ? 'waiting to match' : ub.status}
                  </Badge>
                </div>
                <span className="text-xs font-bold">${ub.amount?.toFixed(2)}</span>
              </div>
              {ub.potential_payout > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  If win: <span className="text-accent font-bold">${ub.potential_payout?.toFixed(2)}</span>
                </p>
              )}
              {ub.status === 'won' && (
                <Button onClick={() => claimMutation.mutate(ub.id)} size="sm"
                  className="w-full mt-2 h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-lg">
                  Claim ${ub.actual_payout?.toFixed(2) || ub.potential_payout?.toFixed(2)}
                </Button>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {/* Action Panel */}
      {hasBet && isOpen && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-primary/20 rounded-2xl p-5">

          {!mode && (
            <div className="space-y-3">
              <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Place a Bet
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMode('offer')}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 hover:border-primary/60 transition-all">
                  <Plus className="w-6 h-6 text-primary" />
                  <p className="font-heading font-bold text-sm text-primary">Open Offer</p>
                  <p className="text-[11px] text-muted-foreground text-center">Provide liquidity. Others can match you.</p>
                </button>
                <button onClick={() => setMode('match')} disabled={totalLiquidity <= 0}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-accent/30 bg-accent/5 p-4 hover:border-accent/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <TrendingUp className="w-6 h-6 text-accent" />
                  <p className="font-heading font-bold text-sm text-accent">Match a Bet</p>
                  <p className="text-[11px] text-muted-foreground text-center">Bet against an open offer at live odds.</p>
                </button>
              </div>
              {totalLiquidity <= 0 && (
                <p className="text-[11px] text-muted-foreground text-center">No offers to match yet — be the first!</p>
              )}
            </div>
          )}

          {/* OFFER MODE */}
          {mode === 'offer' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" /> Open LP Offer
                </h3>
                <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pick an outcome and provide liquidity. Funds lock when matched; unmatched portion stays open.
              </p>
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
                    {o.odds > 0 && (
                      <p className={`text-[10px] font-bold mt-0.5 ${
                        o.color === 'primary' ? 'text-primary' : o.color === 'accent' ? 'text-accent' : 'text-yellow-400'
                      }`}>{o.odds.toFixed(2)}x</p>
                    )}
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {selectedOutcome && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Amount to offer</label>
                      <Input type="number" placeholder="0.00" value={amount} min={1}
                        onChange={e => setAmount(e.target.value)}
                        className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {QUICK_AMOUNTS.map(qa => (
                        <button key={qa} onClick={() => setAmount(String(qa))}
                          className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">${qa}</button>
                      ))}
                    </div>
                    {stakeNum > 0 && (
                      <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">You offer</span>
                          <span className="font-bold">${stakeNum.toFixed(2)} on {getOutcomeLabel(selectedOutcome)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">If matched & you win</span>
                          <span className="font-bold text-accent">you keep matcher's stake (−2% fee)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Unmatched portion</span>
                          <span className="font-bold text-yellow-400">stays open, refundable</span>
                        </div>
                      </div>
                    )}
                    <Button
                      onClick={() => openOfferMutation.mutate({ outcome: selectedOutcome, offerOutcomeLabel: getOutcomeLabel(selectedOutcome), offerAmount: stakeNum })}
                      disabled={stakeNum <= 0 || openOfferMutation.isPending}
                      className="w-full h-12 font-heading font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                      {openOfferMutation.isPending
                        ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        : `Open $${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'} offer on ${getOutcomeLabel(selectedOutcome)}`}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* MATCH MODE */}
          {mode === 'match' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  {matchingOffer ? `Match Offer (${getOutcomeLabel(matchingOffer.outcome)})` : 'Match a Bet'}
                </h3>
                <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>

              {matchingOffer && (
                <div className="bg-secondary/40 rounded-xl p-3 text-xs">
                  <p className="text-muted-foreground">Matching against: <span className="font-bold text-foreground">{getOutcomeLabel(matchingOffer.outcome)}</span> offer · <span className="font-bold text-accent">${matchingOffer.amount_unmatched?.toFixed(2)} available</span></p>
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-2">Pick your outcome:</p>
                <div className="grid grid-cols-3 gap-2">
                  {OUTCOMES.map(o => {
                    const avail = matchingOffer
                      ? (o.key !== matchingOffer.outcome ? matchingOffer.amount_unmatched : 0)
                      : (o.key === 'a' ? avA : o.key === 'b' ? avB : avDraw);
                    const disabled = avail <= 0 || (matchingOffer && o.key === matchingOffer.outcome);
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
                        }`}>{o.odds > 0 ? `${o.odds.toFixed(2)}x` : '—'}</p>
                        <p className="text-[9px] text-muted-foreground">${avail.toFixed(0)} avail.</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {selectedOutcome && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Stake (max ${matchMax.toFixed(2)})</label>
                      <Input type="number" placeholder="0.00" value={amount} min={0} max={matchMax}
                        onChange={e => setAmount(Math.min(parseFloat(e.target.value) || 0, matchMax).toString())}
                        className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {QUICK_AMOUNTS.filter(q => q <= matchMax).map(qa => (
                        <button key={qa} onClick={() => setAmount(String(qa))}
                          className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">${qa}</button>
                      ))}
                      <button onClick={() => setAmount(matchMax.toFixed(2))}
                        className="px-3 py-1.5 text-xs font-bold bg-accent/10 hover:bg-accent/20 text-accent rounded-lg">MAX</button>
                    </div>
                    {stakeNum > 0 && (
                      <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Your stake</span>
                          <span className="font-bold">${stakeNum.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">If {getOutcomeLabel(selectedOutcome)} wins</span>
                          <span className="font-bold text-accent">+${(matchWin - matchFee).toFixed(2)}</span>
                        </div>
                        <div className="h-px bg-border/30" />
                        <div className="flex justify-between text-sm font-bold">
                          <span>Total payout</span>
                          <span className="text-accent text-lg">${matchPayout.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Odds</span>
                          <span>{matchOdds.toFixed(2)}x · 2% fee</span>
                        </div>
                      </div>
                    )}
                    <Button
                      onClick={() => {
                        const offerToMatch = matchingOffer || offers.find(o =>
                          (o.status === 'open' || o.status === 'partially_matched') &&
                          o.outcome !== selectedOutcome &&
                          o.amount_unmatched >= stakeNum
                        );
                        if (offerToMatch) matchOfferMutation.mutate({ offer: offerToMatch, matchAmount: stakeNum });
                      }}
                      disabled={stakeNum <= 0 || stakeNum > matchMax || matchOfferMutation.isPending}
                      className="w-full h-12 font-heading font-bold text-sm bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
                      {matchOfferMutation.isPending
                        ? <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                        : `Bet $${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'} on ${getOutcomeLabel(selectedOutcome)}`}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      {hasBet && !isOpen && (
        <div className="text-center py-8 bg-card border border-border/50 rounded-2xl">
          <p className="text-muted-foreground text-sm">{isSettled ? 'Market settled.' : 'Betting is closed.'}</p>
        </div>
      )}

      {/* Recent activity */}
      {allUserBets.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" /> Recent Activity
          </h3>
          <div className="space-y-2">
            {allUserBets.slice(0, 8).map(ub => (
              <div key={ub.id} className="flex items-center justify-between text-xs py-2 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${ub.role === 'lp' ? 'bg-yellow-400' : 'bg-accent'}`} />
                  <span className="text-muted-foreground">{ub.outcome_label}</span>
                  <span className="text-[10px] text-muted-foreground/60">{ub.role === 'lp' ? 'LP' : 'bet'}</span>
                </div>
                <span className="font-bold">${ub.amount?.toFixed(2)}</span>
                {ub.potential_payout > 0 && <span className="text-accent font-medium">→ ${ub.potential_payout?.toFixed(2)}</span>}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}