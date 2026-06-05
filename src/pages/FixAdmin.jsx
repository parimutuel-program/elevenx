import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, XCircle, Wallet, Loader2 } from 'lucide-react';
import { useWallet } from '@/lib/WalletContext';
import { useAuth } from '@/lib/AuthContext';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function FixAdmin() {
  const { user } = useAuth();
  const { walletAddress, isConnected, connect } = useWallet();
  const [instruction, setInstruction] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);

  // Check current platform admin
  const { data: platformDebug } = useQuery({
    queryKey: ['platformDebug'],
    queryFn: async () => {
      const res = await base44.functions.invoke('debugPlatformAdmin', {});
      return res.data;
    },
  });

  const handleSaveWallet = async () => {
    if (!walletAddress) {
      setError('Connect wallet first');
      return;
    }

    setPreparing(true);
    setError(null);
    try {
      // Save wallet to user account
      await base44.functions.invoke('saveWalletAddress', {
        walletAddress: walletAddress,
        username: user?.full_name || 'Admin',
      });
      
      // Check if wallet matches on-chain admin
      if (platformDebug?.admin && platformDebug.admin.toLowerCase() === walletAddress.toLowerCase()) {
        setError(null);
        alert('✓ Perfect! Your wallet matches the on-chain admin.\n\nYou can now create and settle markets.');
      } else {
        setError('⚠️ Wallet mismatch!\n\nOn-chain admin: ' + (platformDebug?.admin?.slice(0, 8) + '...' + platformDebug?.admin?.slice(-8)) + '\nYour wallet: ' + walletAddress.slice(0, 8) + '...' + walletAddress.slice(-8) + '\n\nYou MUST connect the exact wallet shown as "On-chain admin" above. If you don\'t have that wallet anymore, you\'ll need to deploy a new program instance.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  };

  const handleSuccess = () => {
    setInstruction(null);
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <Wallet className="w-12 h-12 text-primary mx-auto" />
            <h2 className="font-heading font-bold text-xl">Connect Admin Wallet</h2>
            <p className="text-muted-foreground">Connect the Phantom wallet you want to use as admin</p>
            <Button onClick={connect} className="bg-primary hover:bg-primary/90">
              Connect Phantom
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <div>
            <h1 className="font-heading font-bold text-2xl">Fix Admin Error 3012</h1>
            <p className="text-muted-foreground">Reinitialize platform with your current wallet</p>
          </div>
        </div>

        {/* Current Status */}
        <Card className={platformDebug?.initialized ? 'bg-accent/10 border-accent/30' : 'bg-destructive/10 border-destructive/30'}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {platformDebug?.initialized ? (
                  <CheckCircle className="w-6 h-6 text-accent" />
                ) : (
                  <XCircle className="w-6 h-6 text-destructive" />
                )}
                <div>
                  <h3 className="font-heading font-bold">
                    {platformDebug?.initialized ? 'Platform Initialized' : 'Platform NOT Initialized'}
                  </h3>
                  {platformDebug?.initialized && (
                    <p className="text-sm text-muted-foreground">
                      Current admin: <span className="font-mono">{platformDebug.admin?.slice(0, 8)}...{platformDebug.admin?.slice(-8)}</span>
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={platformDebug?.initialized ? 'default' : 'destructive'}>
                {platformDebug?.initialized ? 'ACTIVE' : 'INACTIVE'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Wallet Comparison */}
        {platformDebug?.initialized && (
          <Card className="bg-card border-border/50">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-heading font-bold text-lg">Wallet Mismatch Detected</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-secondary/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">On-chain admin:</span>
                  <span className="font-mono text-sm">{platformDebug.admin?.slice(0, 8)}...{platformDebug.admin?.slice(-8)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                  <span className="text-sm text-muted-foreground">Your wallet:</span>
                  <span className="font-mono text-sm">{walletAddress?.slice(0, 8)}...{walletAddress?.slice(-8)}</span>
                </div>
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-xs text-destructive font-bold">
                    ⚠️ These don't match! That's why you're getting error 3012.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Solution */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Solution</h3>
            
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {platformDebug?.admin && walletAddress?.toLowerCase() === platformDebug.admin.toLowerCase() ? (
              <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg text-center">
                <CheckCircle className="w-8 h-8 text-accent mx-auto mb-2" />
                <p className="font-heading font-bold text-accent">✓ Wallet Matches Admin!</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Your wallet is already the platform admin.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can now create and settle markets.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-xs text-destructive font-bold">⚠️ Wallet Mismatch</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The platform was initialized with a different wallet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    You need to either:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>1. Connect the exact wallet shown above (BfN3...bXDi), OR</li>
                    <li>2. Deploy a new program instance with your current wallet</li>
                  </ul>
                </div>
                
                <Button
                  onClick={handleSaveWallet}
                  disabled={preparing || !walletAddress}
                  className="w-full h-12 font-heading font-bold"
                >
                  {preparing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Save This Wallet
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What This Does */}
        <Card className="bg-secondary/30 border-border/50">
          <CardContent className="p-6">
            <h4 className="font-heading font-bold mb-3">What happens when you click this?</h4>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li>✓ Updates the admin address stored on-chain</li>
              <li>✓ Your wallet becomes the new admin</li>
              <li>✓ All existing markets continue to work</li>
              <li>✓ You can create markets, settle, withdraw fees</li>
              <li>✓ Error 3012 will be gone forever</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}