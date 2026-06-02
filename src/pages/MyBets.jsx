import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Clock, ChevronRight, Wallet } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const statusConfig = {
  active:   { color: 'bg-primary/10 text-primary border-primary/20', icon: Clock },
  pending:  { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  won:      { color: 'bg-accent/20 text-accent border-accent/20', icon: TrendingUp },
  lost:     { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: TrendingDown },
  claimed:  { color: 'bg-accent/20 text-accent border-accent/20', icon: Trophy },
  refunded: { color: 'bg-secondary text-secondary-foreground border-border', icon: Clock },
  void:     { color: 'bg-muted text-muted-foreground border-border', icon: Clock },
};

export default function MyBets() {
  const { user } = useAuth();
  
  // Get wallet address from localStorage
  const getWalletAddress = () => {
    const walletSession = localStorage.getItem('elevenx_wallet_session');
    if (walletSession) {
      try {
        const parsed = JSON.parse(walletSession);
        return parsed.address || parsed;
      } catch {
        return walletSession;
      }
    }
    return null;
  };
  const walletAddress = getWalletAddress();

  const { data: myBets = [], isLoading } = useQuery({
    queryKey: ['myBets', walletAddress, user?.id],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 100);
      // Filter by wallet address (for wallet-only users) or user ID (for registered users)
      // Also include legacy bets without wallet_address for backwards compatibility
      if (walletAddress) {
        return all.filter(ub => ub.wallet_address === walletAddress || !ub.wallet_address);
      }
      if (user?.id) {
        return all.filter(ub => ub.created_by_id === user.id || !ub.wallet_address);
      }
      return [];
    },
    enabled: !!walletAddress || !!user,
  });

  const totalStaked = myBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = myBets.filter(b => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.actual_payout || 0), 0);
  const activeBets = myBets.filter(b => b.status === 'active' || b.status === 'pending');
  const completedBets = myBets.filter(b => b.status !== 'active' && b.status !== 'pending');

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="font-heading font-black text-2xl mb-1">My Bets</h1>
        <p className="text-sm text-muted-foreground">Track all your bets and winnings</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-2xl p-4"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Staked</p>
          <p className="font-heading font-bold text-xl">◎{totalStaked.toLocaleString()}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card border border-border/50 rounded-2xl p-4"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Won</p>
          <p className="font-heading font-bold text-xl text-accent">◎{totalWon.toLocaleString()}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-2xl p-4"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Active</p>
          <p className="font-heading font-bold text-xl text-primary">{activeBets.length}</p>
        </motion.div>
      </div>

      {/* Active bets */}
      {activeBets.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Active Bets
          </h2>
          <div className="space-y-2">
            {activeBets.map((bet, i) => (
              <BetRow key={bet.id} bet={bet} index={i} walletAddress={walletAddress} />
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completedBets.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-sm mb-3">History</h2>
          <div className="space-y-2">
            {completedBets.map((bet, i) => (
              <BetRow key={bet.id} bet={bet} index={i} walletAddress={walletAddress} />
            ))}
          </div>
        </section>
      )}

      {myBets.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No bets yet</p>
          <Link to="/matches" className="text-primary text-sm hover:underline mt-2 inline-block">
            Browse matches →
          </Link>
        </div>
      )}
    </div>
  );
}

function BetRow({ bet, index, walletAddress }) {
  const queryClient = useQueryClient();

  // For LP bets, fetch the offer to check if it's been matched
  const { data: offer } = useQuery({
    queryKey: ['betOffer', bet.offer_id],
    queryFn: () => base44.entities.BetOffer.list().then(offers => offers.find(o => o.id === bet.offer_id)),
    enabled: !!bet.offer_id && bet.role === 'lp',
  });

  // Determine actual display status: if LP offer is matched, show "active" instead of "pending"
  let displayStatus = bet.status;
  if (bet.role === 'lp' && bet.status === 'pending' && offer && (offer.status === 'partially_matched' || offer.status === 'fully_matched')) {
    displayStatus = 'active';
  }

  const config = statusConfig[displayStatus] || statusConfig.active;
  const StatusIcon = config.icon;

  const [pendingTx, setPendingTx] = useState(null);

  const claimMutation = useMutation({
    mutationFn: () => base44.functions.invoke('claimWinnings', { userBetId: bet.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('withdrawLiquidity', {
        userBetId: bet.id,
        walletAddress,
      });
      if (response.data.error) throw new Error(response.data.error);
      if (!response.data.solana_instruction) throw new Error('No solana_instruction returned');
      return { response, amount: response.data.amount, userBetId: bet.id };
    },
    onSuccess: (result) => {
      setPendingTx({
        instruction: result.response.data.solana_instruction,
        amount: result.amount,
        userBetId: result.userBetId,
      });
    },
    onError: (error) => {
      const backendError = error.response?.data?.error || error.message || 'Unknown error';
      alert('Failed to withdraw: ' + backendError);
    },
  });

  const handleTransactionSuccess = async (result) => {
    // Update database records after successful transaction
    if (pendingTx?.userBetId) {
      const ub = await base44.entities.UserBet.list().then(bets => bets.find(b => b.id === pendingTx.userBetId));
      if (ub) {
        await base44.entities.UserBet.update(ub.id, { status: 'refunded' });
        if (ub.offer_id) {
          await base44.entities.BetOffer.update(ub.offer_id, { status: 'cancelled' });
        }
        const lpField = ub.outcome === 'a' ? 'lp_amount_a' : ub.outcome === 'b' ? 'lp_amount_b' : 'lp_amount_draw';
        const currentBet = await base44.entities.Bet.list().then(bets => bets.find(b => b.id === ub.bet_id));
        if (currentBet) {
          await base44.entities.Bet.update(ub.bet_id, {
            [lpField]: Math.max(0, (currentBet[lpField] || 0) - (ub.amount || 0)),
          });
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
    setPendingTx(null);
  };

  const handleTransactionError = (err) => {
    console.error('Withdraw transaction failed:', err);
    setPendingTx(null);
  };

  const isWonAndClaimable = bet.status === 'won';
  
  // Check if this is an unmatched LP bet that can be withdrawn
  const canWithdraw = bet.role === 'lp' && bet.status === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <div className="group flex items-center justify-between p-4 bg-card border border-border/50 rounded-xl">
        <Link to={`/bet/${bet.bet_id}`} className="flex items-center gap-3 flex-1">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${config.color}`}>
            <StatusIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-heading font-bold text-sm">{bet.match_title || 'Match'}</p>
            <p className="text-xs text-muted-foreground">
              Picked: <span className="text-primary font-medium">{bet.outcome_label}</span> · ◎{bet.amount?.toFixed(4)}
              {bet.role === 'lp' && bet.status === 'pending' && (!offer || (offer.status !== 'partially_matched' && offer.status !== 'fully_matched')) && <span className="ml-1 text-yellow-400 font-medium">· awaiting matcher</span>}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {isWonAndClaimable ? (
            <>
              <span className="text-sm font-bold text-accent">◎{bet.potential_payout?.toFixed(4)}</span>
              <Button
                size="sm"
                onClick={() => claimMutation.mutate()}
                disabled={claimMutation.isPending}
                className="h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-lg"
              >
                {claimMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <Wallet className="w-3 h-3 mr-1" />
                    Claim
                  </>
                )}
              </Button>
            </>
          ) : canWithdraw ? (
            <>
              <span className="text-sm font-bold text-yellow-400">◎{bet.amount?.toFixed(4)}</span>
              {pendingTx?.userBetId === bet.id ? (
                <SolanaTransactionSigner
                  instruction={pendingTx.instruction}
                  amount={pendingTx.amount}
                  userBetId={pendingTx.userBetId}
                  isOffer={false}
                  onSuccess={handleTransactionSuccess}
                  onError={handleTransactionError}
                />
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    if (confirm('Withdraw your unmatched LP offer? Your funds will be refunded.')) {
                      withdrawMutation.mutate();
                    }
                  }}
                  disabled={withdrawMutation.isPending}
                  className="h-8 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-bold rounded-lg border border-yellow-500/30"
                >
                  {withdrawMutation.isPending ? (
                    <div className="w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                  ) : (
                    <>
                      <Wallet className="w-3 h-3 mr-1" />
                      Withdraw
                    </>
                  )}
                </Button>
              )}
            </>
          ) : (
            <>
              {(bet.status === 'won' || bet.status === 'claimed') && (
                <span className="text-sm font-bold text-accent">◎{bet.actual_payout?.toFixed(4)}</span>
              )}
              <Badge className={`text-[10px] border ${config.color}`}>
                {bet.status}
              </Badge>
            </>
          )}
          <Link to={`/bet/${bet.bet_id}`}>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}