import React, { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { User, Trophy, TrendingUp, DollarSign, LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const { isConnected, connect, disconnect, walletAddress: connectedWalletAddress, isConnecting } = useWallet();

  const { data: myBets = [] } = useQuery({
    queryKey: ['myBetsProfile'],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 200);
      return all.filter(ub => ub.created_by_id === user?.id);
    },
    enabled: !!user,
  });

  const totalStaked = myBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = myBets.filter(b => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.actual_payout || 0), 0);
  const wins = myBets.filter(b => b.status === 'won' || b.status === 'claimed').length;
  const losses = myBets.filter(b => b.status === 'lost').length;
  const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

  const walletAddress = connectedWalletAddress || user?.wallet_address || user?.data?.wallet_address;

  // Refresh user data when wallet connects
  useEffect(() => {
    if (isConnected && connectedWalletAddress && (!user?.wallet_address || user.wallet_address !== connectedWalletAddress)) {
      refreshUser();
    }
  }, [isConnected, connectedWalletAddress]);

  if (!walletAddress) {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-2xl p-8 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-heading font-bold text-xl mb-2">Connect Wallet First</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your profile is linked to your Solana wallet. Connect your Phantom wallet to view your betting stats and history.
          </p>
          <Button
            onClick={async () => {
              await connect();
              // Wait a bit for wallet to save, then refresh
              setTimeout(() => refreshUser(), 1000);
            }}
            disabled={isConnecting}
            className="bg-primary hover:bg-primary/90 font-heading font-bold h-11 rounded-xl px-8"
          >
            <Wallet className="w-4 h-4 mr-2" />
            {isConnecting ? 'Connecting...' : 'Connect Phantom Wallet'}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-2xl p-6 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8 text-primary" />
        </div>
        <h1 className="font-heading font-bold text-xl">{user?.full_name || 'Complete Registration'}</h1>
        {!user?.full_name && (
          <p className="text-sm text-accent mb-2">Please complete your registration</p>
        )}
        <p className="text-sm text-muted-foreground">{user?.email}</p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-lg border border-border/30">
          <Wallet className="w-3 h-3 text-primary" />
          <span className="text-xs font-mono text-primary">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
          </span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-primary/10 rounded-full">
          <Trophy className="w-3 h-3 text-primary" />
          <span className="text-xs font-semibold text-primary">{user?.role || 'user'}</span>
        </div>
        {!user?.full_name && (
          <Button
            onClick={() => window.location.href = '/register'}
            className="mt-4 bg-primary hover:bg-primary/90 font-heading font-bold h-11 rounded-xl px-8"
          >
            Complete Registration
          </Button>
        )}
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Bets', value: myBets.length, icon: DollarSign, color: 'text-foreground' },
          { label: 'Win Rate', value: `${winRate}%`, icon: TrendingUp, color: 'text-accent' },
          { label: 'Total Staked', value: `◎${totalStaked.toLocaleString()}`, icon: DollarSign, color: 'text-primary' },
          { label: 'Total Won', value: `◎${totalWon.toLocaleString()}`, icon: Trophy, color: 'text-accent' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4"
          >
            <stat.icon className={`w-4 h-4 ${stat.color} mb-2`} />
            <p className={`font-heading font-bold text-lg ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <Button
        variant="outline"
        onClick={async () => {
          // Disconnect wallet and logout
          await disconnect();
          await logout();
          // Clear wallet session from localStorage
          localStorage.removeItem('elevenx_wallet_session');
          // Hard redirect to reload app state
          window.location.href = '/';
        }}
        className="w-full border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/30 h-11 rounded-xl"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out & Disconnect Wallet
      </Button>
    </div>
  );
}