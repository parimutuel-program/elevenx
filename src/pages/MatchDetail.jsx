import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { ArrowLeft, Clock, Trophy, Award, CheckCircle2, Zap, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import OddsPanel from '@/components/betting/OddsPanel';
import OfferBook from '@/components/betting/OfferBook';
import PlaceBetPanel from '@/components/betting/PlaceBetPanel';

const getFlagEmoji = (countryCode) => {
  if (!countryCode) return '🏳️';
  return countryCode.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
};

export default function MatchDetail() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null); // offer to bet against
  const [betMode, setBetMode] = useState('offer'); // 'offer' | 'match'
  const [isRefreshingOdds, setIsRefreshingOdds] = useState(false);
  const [statsApiMatchId, setStatsApiMatchId] = useState('');

  const { data: match } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => base44.entities.Match.list().then(ms => ms.find(m => m.id === matchId)),
    enabled: !!matchId,
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['betsForMatch', matchId],
    queryFn: () => base44.entities.Bet.filter({ match_id: matchId }),
    enabled: !!matchId,
    refetchInterval: 20000,
  });
  const bet = bets[0] || null;

  const getWalletAddress = () => {
    const s = localStorage.getItem('elevenx_wallet_session');
    if (!s) return null;
    try { const p = JSON.parse(s); return p.address || p; } catch { return s; }
  };

  const { data: myUserBets = [] } = useQuery({
    queryKey: ['myUserBets', matchId, user?.id],
    queryFn: () => base44.entities.UserBet.filter({ match_id: matchId }),
    enabled: !!matchId,
  });
  const walletAddress = getWalletAddress();
  const myActiveBets = myUserBets.filter(ub =>
    (walletAddress && ub.wallet_address === walletAddress) || (user?.id && ub.created_by_id === user.id)
  );

  // Admin: create market
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
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] }),
  });

  // Sync local statsApiMatchId when bet loads
  React.useEffect(() => {
    if (bet?.stats_api_match_id && !statsApiMatchId) {
      setStatsApiMatchId(bet.stats_api_match_id);
    }
  }, [bet?.stats_api_match_id]);

  // Refresh odds from TheStatsAPI
  const refreshOdds = async () => {
    const matchIdToUse = statsApiMatchId.trim();
    if (!matchIdToUse) {
      alert('Enter a TheStatsAPI match ID first');
      return;
    }
    // Save it if changed
    if (matchIdToUse !== bet?.stats_api_match_id) {
      await base44.entities.Bet.update(bet.id, { stats_api_match_id: matchIdToUse });
    }
    setIsRefreshingOdds(true);
    try {
      const res = await base44.functions.invoke('fetchMatchOdds', {
        stats_api_match_id: matchIdToUse,
        action: 'odds',
      });
      if (res.data.odds) {
        await base44.entities.Bet.update(bet.id, {
          odds_a: res.data.odds.home,
          odds_b: res.data.odds.away,
          odds_draw: res.data.odds.draw,
          odds_bookmaker: res.data.bookmaker,
          odds_updated_at: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
      } else {
        alert(res.data.message || 'No odds available yet');
      }
    } catch (e) {
      alert('Failed to fetch odds: ' + e.message);
    }
    setIsRefreshingOdds(false);
  };

  // Admin settle
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
    onError: (err) => alert('Settle failed: ' + err.message),
  });

  // Claim winnings
  const claimMutation = useMutation({
    mutationFn: async (ubId) => {
      const res = await base44.functions.invoke('claimWinnings', { userBetId: ubId });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myUserBets', matchId, user?.id] }),
  });

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

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to matches
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
            <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-5xl shadow-lg">
              {getFlagEmoji(match.team_a_flag)}
            </div>
            <p className="font-heading font-black text-lg">{match.team_a}</p>
          </div>
          <div className="text-center">
            {(match.status === 'finished' || match.status === 'live') ? (
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
            <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 flex items-center justify-center text-5xl shadow-lg">
              {getFlagEmoji(match.team_b_flag)}
            </div>
            <p className="font-heading font-black text-lg">{match.team_b}</p>
          </div>
        </div>
      </motion.div>

      {/* ── No market (admin) ── */}
      {!hasBet && isAdmin && (
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
      )}

      {!hasBet && !isAdmin && (
        <div className="text-center py-10 bg-card border border-border/50 rounded-2xl">
          <p className="text-muted-foreground text-sm">Betting market not open yet. Check back soon!</p>
        </div>
      )}

      {/* ── Admin: Set Stats API ID + Fetch Odds ── */}
      {hasBet && isAdmin && isOpen && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground">Admin: Odds Management</span>
          </div>
          <div className="flex gap-2">
            <input
              value={statsApiMatchId}
              onChange={e => setStatsApiMatchId(e.target.value)}
              placeholder="TheStatsAPI match ID (e.g. mt_14502)"
              className="flex-1 text-xs bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground"
            />
            <Button size="sm" onClick={refreshOdds} disabled={isRefreshingOdds}
              className="h-9 text-xs font-bold rounded-xl">
              {isRefreshingOdds ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" />Fetching...</> : 'Fetch Odds'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── Odds Panel ── */}
      {hasBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OddsPanel
            bet={bet}
            match={match}
            selectedOutcome={betMode === 'offer' ? selectedOutcome : null}
            onSelectOutcome={isOpen ? handleSelectOutcome : undefined}
            onRefreshOdds={isAdmin && isOpen ? refreshOdds : undefined}
            isRefreshing={isRefreshingOdds}
          />
        </motion.div>
      )}

      {/* ── Bet Panel: new offer or match against offer ── */}
      {hasBet && isOpen && (selectedOutcome || selectedOffer) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={betMode + selectedOutcome + selectedOffer?.id}>
          <PlaceBetPanel
            bet={bet}
            matchId={matchId}
            mode={betMode}
            selectedOutcome={selectedOutcome}
            selectedOffer={selectedOffer}
            onSuccess={handleBetSuccess}
          />
        </motion.div>
      )}

      {hasBet && isOpen && !selectedOutcome && !selectedOffer && (
        <p className="text-center text-xs text-muted-foreground py-2">
          Pick an outcome above to place your own offer, or click "Bet Against" on an open offer below
        </p>
      )}

      {/* ── Open Offer Book ── */}
      {hasBet && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <OfferBook betId={bet.id} bet={bet} onSelectOffer={isOpen ? handleSelectOffer : undefined} />
        </motion.div>
      )}

      {/* ── Admin: Settle ── */}
      {hasBet && isAdmin && !isSettled && (match.status === 'finished' || isOpen) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-accent/20 rounded-2xl p-5">
          <div className="text-center mb-4">
            <Trophy className="w-8 h-8 text-accent mx-auto mb-2" />
            <h3 className="font-heading font-bold mb-1">Settle Market</h3>
            <p className="text-xs text-muted-foreground">Select the winner — all matched bets will be settled</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['a', 'b', 'draw'].map(outcome => (
              <Button key={outcome}
                onClick={() => {
                  const label = outcome === 'draw' ? 'Draw' : outcome === 'a' ? bet.outcome_a : bet.outcome_b;
                  if (confirm(`Settle as ${label}?`)) settleMutation.mutate(outcome);
                }}
                disabled={settleMutation.isPending}
                className={`h-10 font-heading font-bold text-xs rounded-xl ${
                  outcome === 'a' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' :
                  outcome === 'b' ? 'bg-accent hover:bg-accent/90 text-accent-foreground' :
                  'bg-yellow-500 hover:bg-yellow-500/90 text-white'
                }`}>
                {outcome === 'a' ? bet.outcome_a : outcome === 'b' ? bet.outcome_b : 'Draw'}
              </Button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Settled ── */}
      {hasBet && isSettled && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-accent/20 rounded-2xl p-5 text-center">
          <CheckCircle2 className="w-8 h-8 text-accent mx-auto mb-2" />
          <h3 className="font-heading font-bold mb-1">Market Settled</h3>
          <p className="text-sm text-accent font-bold">
            Winner: {bet.winning_outcome === 'a' ? bet.outcome_a : bet.winning_outcome === 'b' ? bet.outcome_b : 'Draw'}
          </p>
        </motion.div>
      )}

      {/* ── My Positions ── */}
      {myActiveBets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-primary/20 rounded-2xl p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" /> My Positions
          </h3>
          {myActiveBets.map(ub => (
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
                    'bg-muted text-muted-foreground'
                  }`}>{ub.status}</Badge>
                  {ub.role === 'lp' && <Badge className="text-[9px] py-0 bg-primary/10 text-primary">offer</Badge>}
                </div>
                <span className="font-bold">◎{ub.amount?.toFixed(4)}</span>
              </div>
              {ub.potential_payout > 0 && (
                <p className="text-xs text-muted-foreground">
                  Payout if win: <span className="text-accent font-bold">◎{ub.potential_payout?.toFixed(4)}</span>
                </p>
              )}
              {ub.status === 'pending' && ub.role === 'lp' && (
                <p className="text-[10px] text-yellow-400 mt-1">⏳ Waiting to be matched — can withdraw anytime</p>
              )}
              {ub.status === 'won' && (
                <Button onClick={() => claimMutation.mutate(ub.id)}
                  disabled={claimMutation.isPending}
                  size="sm"
                  className="w-full mt-2 h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-lg">
                  {claimMutation.isPending ? 'Claiming...' : `Claim ◎${ub.actual_payout?.toFixed(4) || ub.potential_payout?.toFixed(4)}`}
                </Button>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}