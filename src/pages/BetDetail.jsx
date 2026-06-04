import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { ArrowLeft, Clock, CheckCircle2, XCircle, Trophy, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import OddsBar from '@/components/betting/OddsBar';
import BetSlip from '@/components/betting/BetSlip';
import OfferBook from '@/components/betting/OfferBook';

// Helper to convert country code to flag emoji
function getFlagEmoji(countryCode) {
  if (!countryCode) return '🏳️';
  const code = countryCode.toUpperCase();
  return code.split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
}

export default function BetDetail() {
  const { betId } = useParams();
  const { user } = useAuth();
  const { isConnected, connect, shortAddress } = useWallet();
  const queryClient = useQueryClient();
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

  const { data: bet } = useQuery({
    queryKey: ['bet', betId],
    queryFn: () => base44.entities.Bet.list().then(bets => bets.find(b => b.id === betId)),
    enabled: !!betId,
  });

  // Scroll to betting section on page load
  useEffect(() => {
    if (bet) {
      setTimeout(() => {
        const element = document.getElementById('betting-section');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, [bet?.id]);

  // Calculate time remaining - updates every second
  useEffect(() => {
    if (!bet?.open_until) {
      setTimeRemaining(null);
      return;
    }

    const updateTime = () => {
      const now = new Date().getTime();
      const closeTime = new Date(bet.open_until).getTime();
      const diff = closeTime - now;
      
      if (diff <= 0) {
        setTimeRemaining({ minutes: 0, seconds: 0, total: 0 });
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining({ minutes, seconds, total: diff });
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [bet?.open_until, bet?.id]);

  const { data: match } = useQuery({
    queryKey: ['match', bet?.match_id],
    queryFn: () => base44.entities.Match.list().then(ms => ms.find(m => m.id === bet.match_id)),
    enabled: !!bet?.match_id,
  });

  const { data: myBets = [] } = useQuery({
    queryKey: ['myBetsForBet', betId],
    queryFn: () => base44.entities.UserBet.filter({ bet_id: betId }),
    enabled: !!betId,
  });

  const myBet = myBets.find(ub => ub.created_by_id === user?.id);

  const placeBetMutation = useMutation({
    mutationFn: async (amount) => {
      const result = await base44.functions.invoke('placeBet', {
        walletAddress: shortAddress,
        bet_id: betId,
        match_id: bet.match_id,
        outcome: selectedOutcome,
        amount,
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bet', betId] });
      queryClient.invalidateQueries({ queryKey: ['myBetsForBet', betId] });
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      setSelectedOutcome(null);
    },
    onError: () => {},
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.UserBet.update(myBet.id, { status: 'claimed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myBetsForBet', betId] });

    },
  });

  if (!bet || !match) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Bet is open if status is 'open' and time hasn't expired
  const isOpen = bet?.status === 'open' && timeRemaining && timeRemaining.total > 0;
  const isSettled = bet?.status === 'settled';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to matches
      </Link>

      {/* Match header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground">{match.group_stage || 'World Cup 2026'}</span>
          <Badge className={`text-[10px] uppercase tracking-wider ${
            bet.status === 'open' ? 'bg-accent/20 text-accent' :
            bet.status === 'settled' ? 'bg-primary/20 text-primary' :
            'bg-secondary text-secondary-foreground'
          }`}>
            {bet.status}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 text-center">
            <div className="text-5xl mb-2">{getFlagEmoji(match.team_a_flag)}</div>
            <p className="font-heading font-bold">{match.team_a}</p>
          </div>
          <div className="text-center">
            {match.status === 'finished' || match.status === 'live' ? (
              <div className="flex items-center gap-3">
                <span className="text-3xl font-heading font-bold">{match.score_a ?? 0}</span>
                <span className="text-muted-foreground">-</span>
                <span className="text-3xl font-heading font-bold">{match.score_b ?? 0}</span>
              </div>
            ) : (
              <span className="text-sm font-bold text-primary bg-primary/10 px-4 py-2 rounded-full">VS</span>
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="text-5xl mb-2">{getFlagEmoji(match.team_b_flag)}</div>
            <p className="font-heading font-bold">{match.team_b}</p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/30 flex flex-col items-center gap-3">
          {timeRemaining && timeRemaining.total > 0 ? (
            <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2.5 rounded-xl text-base font-black animate-pulse">
              <Clock className="w-5 h-5" />
              BETTING CLOSES IN: {timeRemaining.minutes}:{String(timeRemaining.seconds).padStart(2, '0')}
            </div>
          ) : timeRemaining && timeRemaining.total === 0 ? (
            <div className="flex items-center gap-2 bg-destructive/20 text-destructive px-4 py-2.5 rounded-xl text-sm font-bold">
              <Clock className="w-4 h-4" />
              BETS CLOSED
            </div>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {bet.open_until ? `Closes ${format(new Date(bet.open_until), 'MMM d · HH:mm')}` : 'No deadline'}
            </span>
          )}
        </div>
      </motion.div>

      {/* Odds */}
      <motion.div
        id="betting-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border/50 rounded-2xl p-6"
      >
        <h3 className="font-heading font-bold text-sm mb-4">Fixed Odds</h3>
        <OddsBar
          bet={bet}
          match={match}
          selected={selectedOutcome}
          onSelect={setSelectedOutcome}
          canSelect={isOpen && !myBet && isConnected}
        />
      </motion.div>

      {/* LP Offer Book */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <OfferBook
          betId={betId}
          bet={bet}
          onSelectOffer={(offer) => {
            setSelectedOffer(offer);
            // Set the opposite outcome so bettor bets against the LP
            const opposite = offer.outcome === 'a' ? 'b' : offer.outcome === 'b' ? 'a' : 'draw';
            setSelectedOutcome(opposite);
          }}
        />
      </motion.div>

      {/* My existing bet */}
      {myBet && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border border-primary/20 rounded-2xl p-5"
        >
          <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            {myBet.status === 'won' || myBet.status === 'claimed' ? (
              <CheckCircle2 className="w-4 h-4 text-accent" />
            ) : myBet.status === 'lost' ? (
              <XCircle className="w-4 h-4 text-destructive" />
            ) : (
              <Trophy className="w-4 h-4 text-primary" />
            )}
            Your Bet
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Pick</p>
              <p className="font-bold text-primary">{myBet.outcome_label}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Stake</p>
              <p className="font-bold">◎{myBet.amount?.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <Badge className={`text-[10px] ${
                myBet.status === 'won' ? 'bg-accent/20 text-accent' :
                myBet.status === 'lost' ? 'bg-destructive/20 text-destructive' :
                myBet.status === 'claimed' ? 'bg-primary/20 text-primary' :
                'bg-secondary text-secondary-foreground'
              }`}>
                {myBet.status}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Potential Payout</p>
              <p className="font-bold text-primary">◎{myBet.potential_payout?.toFixed(4)}</p>
            </div>
            {(myBet.status === 'won' || myBet.status === 'claimed') && (
              <div>
                <p className="text-muted-foreground text-xs">Actual Payout</p>
                <p className="font-bold text-accent">◎{myBet.actual_payout?.toFixed(4)}</p>
              </div>
            )}
          </div>

          {myBet.status === 'won' && (
            <Button
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending}
              className="w-full mt-4 bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold h-11 rounded-xl"
            >
              Claim ${myBet.actual_payout?.toFixed(2)}
            </Button>
          )}
        </motion.div>
      )}

      {/* Wallet gate — shown when bet is open but wallet not connected */}
      {isOpen && !myBet && !isConnected && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-primary/20 p-7 text-center"
          style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-heading font-black text-xl text-white mb-2">Connect to Bet</h3>
          <p className="text-white/50 text-sm mb-5 max-w-xs mx-auto">
            Connect your Phantom wallet to place a bet on this match. Sessions are stored in your browser.
          </p>
          <Button
            onClick={connect}
            className="font-heading font-bold px-8 h-11 rounded-xl text-sm"
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)', boxShadow: '0 0 24px rgba(166,156,242,0.3)' }}
          >
            <Wallet className="w-4 h-4 mr-2" />
            Connect Phantom Wallet
          </Button>
        </motion.div>
      )}

      {/* Bet Slip — shown when outcome selected and wallet connected */}
      {isOpen && !myBet && isConnected && selectedOutcome && (
        <BetSlip
          bet={bet}
          selectedOutcome={selectedOutcome}
          onPlaceBet={(amount) => placeBetMutation.mutate(amount)}
          isPlacing={placeBetMutation.isPending}
        />
      )}

      {/* Prompt to pick an outcome */}
      {isOpen && !myBet && isConnected && !selectedOutcome && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center py-6 bg-card border border-border/50 rounded-2xl"
        >
          <p className="text-muted-foreground text-sm">👆 Pick an outcome above to place your bet</p>
          <p className="text-xs text-primary/70 mt-1 font-medium">{shortAddress}</p>
        </motion.div>
      )}

      {!isOpen && !myBet && (
        <div className="text-center py-8 bg-card border border-border/50 rounded-2xl">
          <p className="text-muted-foreground text-sm">
            {isSettled ? 'This bet has been settled.' : 'Betting is closed for this match.'}
          </p>
        </div>
      )}
    </div>
  );
}