import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Clock, ChevronRight, Wallet, ArrowLeft, CheckCircle, ExternalLink, Target, Users, DollarSign, Activity, Award, Shield, Flame, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import StatCard from '@/components/dashboard/StatCard';
import QuickStat from '@/components/dashboard/QuickStat';
import EmptyState from '@/components/dashboard/EmptyState';
import BetCard from '@/components/dashboard/BetCard';

const statusConfig = {
  active:   { color: 'bg-primary/10 text-primary border-primary/20', icon: Clock, label: 'Active' },
  pending:  { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock, label: 'Pending' },
  won:      { color: 'bg-accent/20 text-accent border-accent/20', icon: TrendingUp, label: 'Won' },
  lost:     { color: 'bg-destructive/10 text-destructive border-destructive/20', icon: TrendingDown, label: 'Lost' },
  claimed:  { color: 'bg-accent/20 text-accent border-accent/20', icon: Trophy, label: 'Claimed' },
  refunded: { color: 'bg-secondary text-secondary-foreground border-border', icon: Shield, label: 'Refunded' },
  void:     { color: 'bg-muted text-muted-foreground border-border', icon: Clock, label: 'Void' },
};

const RefundDialog = ({ open, onClose, data, onSignSuccess }) => {
  const [signature, setSignature] = useState(null);
  
  const handleSignSuccess = (result) => {
    setSignature(result.signature);
    onSignSuccess();
  };
  
  if (!data) return null;
  
  // Show success state
  if (signature) {
    const solanaScanUrl = `https://solscan.io/tx/${signature}?cluster=devnet`;
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent" />
              Refund Claimed!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
              <CheckCircle className="w-12 h-12 text-accent mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">Refund Claimed!</p>
              <p className="font-heading font-bold text-3xl text-accent">◎{data?.refundAmount.toFixed(4)} SOL</p>
              <p className="text-xs text-muted-foreground mt-2">Successfully transferred to your wallet</p>
            </div>
            
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">Transaction Details</p>
              <a 
                href={solanaScanUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-2 text-primary text-xs font-bold hover:underline"
              >
                View on Solscan <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{signature.slice(0, 20)}...{signature.slice(-16)}</p>
            </div>
            
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
  }
  
  // Show signing state
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ArrowLeft className="w-5 h-5 text-yellow-400" />
            Claim Refund
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">Refund Amount</p>
            <p className="font-heading font-bold text-2xl text-yellow-400">◎{data?.refundAmount.toFixed(4)} SOL</p>
            <p className="text-xs text-muted-foreground mt-2">Unmatched liquidity will be returned to your wallet</p>
          </div>
          
          <SolanaTransactionSigner
            instruction={data.solanaInstruction}
            amount={data.refundAmount}
            userBetId={data.userBetId}
            onSuccess={handleSignSuccess}
            onError={() => onClose()}
          />
          
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full h-10 text-sm rounded-xl border-border/50"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function MyBets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refundDialog, setRefundDialog] = useState(null);

  const getWalletAddress = () => {
    const walletSession = localStorage.getItem('elevenx_wallet_session');
    if (walletSession) {
      try {
        const parsed = JSON.parse(walletSession);
        return parsed.address || parsed;
      } catch { return walletSession; }
    }
    return null;
  };
  const walletAddress = getWalletAddress();

  const { data: myBets = [], isLoading } = useQuery({
    queryKey: ['myBets', walletAddress, user?.id],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 100);
      if (walletAddress) return all.filter(ub => ub.wallet_address === walletAddress);
      if (user?.id) return all.filter(ub => ub.created_by_id === user.id);
      return [];
    },
    enabled: !!walletAddress || !!user,
  });

  const totalStaked = myBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = myBets.filter(b => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.actual_payout || 0), 0);
  const activeBets = myBets.filter(b => b.status === 'active' || b.status === 'pending');
  const completedBets = myBets.filter(b => b.status !== 'active' && b.status !== 'pending');
  const pendingClaims = myBets.filter(b => b.status === 'won');
  const availableRefunds = myBets.filter(b => b.status === 'refunded');
  
  const potentialWinnings = activeBets.reduce((s, b) => s + (b.potential_payout || 0), 0);
  const winRate = myBets.length > 0 ? ((myBets.filter(b => b.status === 'won' || b.status === 'claimed').length / myBets.length) * 100).toFixed(1) : 0;

  const handleRefundSuccess = () => {
    setRefundDialog(null);
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <RefundDialog
        open={!!refundDialog}
        data={refundDialog}
        onClose={() => setRefundDialog(null)}
        onSignSuccess={handleRefundSuccess}
      />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-black text-3xl mb-1">My Bets Dashboard</h1>
          <p className="text-sm text-muted-foreground">Track your World Cup betting performance</p>
        </div>
        <Link to="/matches">
          <Button variant="outline" className="gap-2 rounded-xl">
            <Activity className="w-4 h-4" />
            Browse Matches
          </Button>
        </Link>
      </div>

      {/* Enhanced Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="Total Staked" 
          value={`◎${totalStaked.toFixed(4)}`} 
          icon={DollarSign}
          color="text-foreground"
          delay={0}
        />
        <StatCard 
          label="Potential Winnings" 
          value={`◎${potentialWinnings.toFixed(4)}`} 
          icon={TrendingUp}
          color="text-primary"
          delay={0.05}
        />
        <StatCard 
          label="Total Won" 
          value={`◎${totalWon.toFixed(4)}`} 
          icon={Award}
          color="text-accent"
          delay={0.1}
        />
        <StatCard 
          label="Win Rate" 
          value={`${winRate}%`} 
          icon={Target}
          color="text-accent"
          delay={0.15}
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <QuickStat 
          label="Active Bets" 
          value={activeBets.length}
          icon={Flame}
          color="bg-primary/10 text-primary"
        />
        <QuickStat 
          label="Pending Claims" 
          value={pendingClaims.length}
          icon={Wallet}
          color="bg-accent/10 text-accent"
        />
        <QuickStat 
          label="Available Refunds" 
          value={availableRefunds.length}
          icon={Shield}
          color="bg-yellow-500/10 text-yellow-400"
        />
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-card border border-border/50 rounded-xl">
          <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg">
            <Clock className="w-4 h-4 mr-2" />
            Active ({activeBets.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-lg">
            <Award className="w-4 h-4 mr-2" />
            Pending Claims ({pendingClaims.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground rounded-lg">
            <BarChart3 className="w-4 h-4 mr-2" />
            History ({completedBets.filter(b => b.status !== 'won').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3">
          {activeBets.length > 0 ? (
            activeBets.map((bet, i) => (
              <BetCard 
                key={bet.id} 
                bet={bet} 
                index={i} 
                walletAddress={walletAddress} 
                onRefundRequest={(data) => setRefundDialog(data)}
              />
            ))
          ) : (
            <EmptyState message="No active bets" actionText="Browse Matches" link="/matches" />
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          {pendingClaims.length > 0 ? (
            pendingClaims.map((bet, i) => (
              <BetCard 
                key={bet.id} 
                bet={bet} 
                index={i} 
                walletAddress={walletAddress} 
                onRefundRequest={(data) => setRefundDialog(data)}
              />
            ))
          ) : (
            <EmptyState message="No pending claims" />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {completedBets.filter(b => b.status !== 'won').length > 0 ? (
            completedBets.filter(b => b.status !== 'won').map((bet, i) => (
              <BetCard 
                key={bet.id} 
                bet={bet} 
                index={i} 
                walletAddress={walletAddress} 
                onRefundRequest={(data) => setRefundDialog(data)}
              />
            ))
          ) : (
            <EmptyState message="No betting history" />
          )}
        </TabsContent>
      </Tabs>

      {myBets.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <Trophy className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-lg mb-2">No bets yet</p>
          <p className="text-muted-foreground text-sm mb-4">Start betting on World Cup matches!</p>
          <Link to="/matches">
            <Button className="gap-2 rounded-xl">
              <Activity className="w-4 h-4" />
              Browse Matches
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function BetRow({ bet, index, onRefundRequest }) {
  const queryClient = useQueryClient();

  const config = statusConfig[bet.status] || statusConfig.active;
  const StatusIcon = config.icon;

  const claimMutation = useMutation({
    mutationFn: () => base44.functions.invoke('claimWinnings', { userBetId: bet.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myBets'] }),
    onError: (error) => alert('Claim failed: ' + (error.message || 'Unknown error')),
  });

  const claimRefundMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('claimRefund', { userBetId: bet.id });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      onRefundRequest({
        userBetId: bet.id,
        refundAmount: bet.amount,
        solanaInstruction: data.solana_instruction,
      });
    },
    onError: (error) => alert('Refund claim failed: ' + (error.message || 'Unknown error')),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <div className="group flex items-center justify-between p-4 bg-card border border-border/50 rounded-xl">
        <Link to={`/match/${bet.match_id}`} className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
            <StatusIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-sm truncate">{bet.match_title || 'Match'}</p>
            <p className="text-xs text-muted-foreground">
              Backed: <span className="text-primary font-medium">{bet.outcome_label}</span> · ◎{bet.amount?.toFixed(4)}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3 flex-shrink-0">
          {bet.status === 'won' ? (
            <>
              <span className="text-sm font-bold text-accent">◎{bet.potential_payout?.toFixed(4)}</span>
              <Button size="sm" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending}
                className="h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-lg">
                {claimMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                ) : (
                  <><Wallet className="w-3 h-3 mr-1" />Claim</>
                )}
              </Button>
            </>
          ) : bet.status === 'refunded' ? (
            <>
              <span className="text-sm font-bold text-yellow-400">◎{bet.amount?.toFixed(4)}</span>
              <Button size="sm" onClick={() => claimRefundMutation.mutate()} disabled={claimRefundMutation.isPending}
                className="h-8 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-bold rounded-lg border border-yellow-500/30">
                {claimRefundMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                ) : (
                  <><Wallet className="w-3 h-3 mr-1" />Claim Refund</>
                )}
              </Button>
            </>
          ) : (
            <>
              {(bet.status === 'claimed') && (
                <span className="text-sm font-bold text-accent">◎{bet.actual_payout?.toFixed(4)}</span>
              )}
              <Badge className={`text-[10px] border ${config.color}`}>{bet.status}</Badge>
            </>
          )}
          <Link to={`/match/${bet.match_id}`}>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}