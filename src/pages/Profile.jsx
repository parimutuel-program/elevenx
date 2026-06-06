import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { User, Trophy, TrendingUp, DollarSign, LogOut, Wallet, RefreshCcw, Camera, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const { isConnected, connect, disconnect, walletAddress: connectedWalletAddress, isConnecting } = useWallet();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Use auth user directly
  const currentUser = user;
  
  // Define walletAddress early to avoid reference errors
  const walletAddress = connectedWalletAddress || currentUser?.wallet_address;
  const profilePicture = currentUser?.profile_picture;
  
  console.log('Profile - currentUser:', currentUser);
  console.log('Profile - currentUser.full_name:', currentUser?.full_name);
  console.log('Profile - currentUser.username:', currentUser?.username);
  console.log('Profile - user (auth):', user);
  console.log('Profile - connectedWalletAddress:', connectedWalletAddress);
  console.log('Profile - isConnected:', isConnected);

  // Auto-logout when wallet disconnects (only if previously connected)
  const wasConnectedRef = useRef(false);
  
  React.useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
    } else if (wasConnectedRef.current && (currentUser || walletAddress)) {
      console.log('Wallet disconnected after being connected, logging out...');
      logout();
    }
  }, [isConnected, currentUser, walletAddress]);

  const { data: myBets = [] } = useQuery({
    queryKey: ['myBetsProfile'],
    queryFn: async () => {
      const all = await base44.entities.UserBet.list('-created_date', 200);
      return all.filter(ub => ub.created_by_id === currentUser?.id);
    },
    enabled: !!currentUser?.id,
  });

  const totalStaked = myBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = myBets.filter(b => b.status === 'won' || b.status === 'claimed').reduce((s, b) => s + (b.actual_payout || 0), 0);
  const wins = myBets.filter(b => b.status === 'won' || b.status === 'claimed').length;
  const losses = myBets.filter(b => b.status === 'lost').length;
  const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

  const { data: platformDebug } = useQuery({
    queryKey: ['platformDebug'],
    queryFn: async () => {
      const res = await base44.functions.invoke('debugPlatformAdmin', {});
      return res.data;
    },
    enabled: currentUser?.role === 'admin',
  });

  const reinitMutation = useMutation({
    mutationFn: async () => {
      console.log('[Profile] Calling reinitPlatformWithWallet with wallet:', walletAddress);
      const res = await base44.functions.invoke('reinitPlatformWithWallet', { walletAddress });
      console.log('[Profile] Response:', res.data);
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onError: (error) => {
      console.error('[Profile] Reinit error:', error);
      alert('Error: ' + error.message);
    },
  });

  const uploadProfilePicture = async (file) => {
    setIsUploading(true);
    try {
      // Upload file using Base44 integration
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Update user entity with profile picture URL
      await base44.auth.updateMe({ profile_picture: file_url });
      
      // Refresh user data
      await refreshUser();
      
      // Close dialog
      setIsUploadDialogOpen(false);
      
      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload profile picture: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      uploadProfilePicture(file);
    }
  };

  // Show connect prompt if wallet not connected
  if (!walletAddress) {
    return (
      <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-2xl p-6 sm:p-8 text-center"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          </div>
          <h1 className="font-heading font-bold text-lg sm:text-xl mb-2">Connect Wallet First</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mb-6 px-2">
            Your profile is linked to your Solana wallet. Connect your Phantom wallet to view your betting stats and history.
          </p>
          <Button
            onClick={async () => {
              await connect();
              setTimeout(() => refreshUser(), 1000);
            }}
            disabled={isConnecting}
            className="bg-primary hover:bg-primary/90 font-heading font-bold h-11 rounded-xl px-8 w-full sm:w-auto"
          >
            <Wallet className="w-4 h-4 mr-2" />
            {isConnecting ? 'Connecting...' : 'Connect Phantom Wallet'}
          </Button>
        </motion.div>
      </div>
    );
  }



  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0 max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-2xl p-5 sm:p-6 text-center"
      >
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-4">
          {profilePicture ? (
            <img
              src={profilePicture}
              alt="Profile"
              className="w-full h-full rounded-full object-cover border-2 border-primary/30"
            />
          ) : (
            <img
              src="https://media.base44.com/images/public/6a1da108eb293de119e4e930/610671979_Untitled-June032026at0751431.png"
              alt="Profile"
              className="w-full h-full rounded-full object-cover border-2 border-primary/30 bg-primary/10 p-2"
            />
          )}
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <button
                className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-card hover:bg-primary/90 transition-colors"
                onClick={() => setIsUploadDialogOpen(true)}
              >
                <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Change Profile Picture</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-6 sm:p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Click to upload</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG up to 5MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {isUploading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Uploading...
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <h1 className="font-heading font-bold text-lg sm:text-xl break-all px-2">
          {walletAddress?.slice(0, 8) || 'User'}
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-lg border border-border/30">
          <Wallet className="w-3 h-3 text-primary" />
          <span className="text-xs font-mono text-primary">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
          </span>
        </div>
        {currentUser?.role && (
          <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-primary/10 rounded-full">
            <Trophy className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-primary">{currentUser.role}</span>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
            className="bg-card border border-border/50 rounded-2xl p-3 sm:p-4"
          >
            <stat.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${stat.color} mb-2`} />
            <p className={`font-heading font-bold text-base sm:text-lg ${stat.color}`}>{stat.value}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <Button
        variant="outline"
        onClick={async () => {
          await disconnect();
          await logout();
          localStorage.removeItem('elevenx_wallet_session');
          window.location.href = '/';
        }}
        className="w-full border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/30 h-11 rounded-xl text-sm"
      >
        <LogOut className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">Sign Out & Disconnect Wallet</span>
        <span className="sm:hidden">Sign Out</span>
      </Button>

      {currentUser?.role === 'admin' && (
        <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-6 space-y-3">
          <h2 className="font-heading font-bold text-sm">Admin Platform Config</h2>
          {platformDebug?.success ? (
            <div className="space-y-3">
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-3">
                <p className="text-xs text-accent font-bold mb-1">✓ Platform Already Initialized</p>
                <p className="text-[10px] text-muted-foreground break-all">
                  Admin: <span className="font-mono text-accent">{platformDebug.admin?.slice(0, 6)}...{platformDebug.admin?.slice(-6)}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Fee: {(platformDebug.feePercent / 100).toFixed(2)}% | Consensus: {platformDebug.consensusThreshold}
                </p>
              </div>
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
                <p className="text-xs text-destructive font-bold">⚠ "Betting Window Closed" Error?</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  This error is from <strong>markets</strong>, not the platform. Your platform is fine.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Go to <strong>Admin panel</strong> → Click ⚡ Test Mode on markets to fix timestamps.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Platform not initialized. Click below to initialize with your wallet as admin.
              </p>
              <Button
                onClick={() => reinitMutation.mutate()}
                disabled={reinitMutation.isPending || !isConnected || !walletAddress}
                className="w-full h-11 rounded-xl text-sm"
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                {reinitMutation.isPending ? 'Preparing...' : !walletAddress ? 'Connect Wallet First' : 'Initialize Platform'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}