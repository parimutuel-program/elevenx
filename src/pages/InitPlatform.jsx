import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertTriangle, Key, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function InitPlatform() {
  const { isConnected, isConnecting, connect } = useWallet();
  const [instruction, setInstruction] = useState(null);
  const [error, setError] = useState(null);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const { walletAddress } = useWallet();

  const { data: platformStatus, refetch } = useQuery({
    queryKey: ['platformStatus'],
    queryFn: () => base44.functions.invoke('checkPlatformConfig', {}),
    refetchOnWindowFocus: false,
  });

  const { data: programIdData } = useQuery({
    queryKey: ['programId'],
    queryFn: () => base44.functions.invoke('solanaConfig', {}),
  });

  const { data: diagnosis } = useQuery({
    queryKey: ['diagnosis'],
    queryFn: () => base44.functions.invoke('diagnosePlatform', {}),
    refetchOnWindowFocus: false,
  });

  const handleRegisterAdmin = async () => {
    try {
      console.log('[InitPlatform] handleRegisterAdmin called, walletAddress:', walletAddress);
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
      }
      const res = await base44.functions.invoke('registerAdminWallet', { walletAddress });
      console.log('[InitPlatform] registerAdminWallet response:', res.data);
      if (res.data.error) throw new Error(res.data.error);
      setError(null);
      alert(res.data.message || 'Wallet registered as admin!');
      await refetch();
    } catch (err) {
      console.error('[InitPlatform] handleRegisterAdmin error:', err);
      setError(err.message);
    }
  };

  const handleInit = async () => {
    try {
      console.log('[InitPlatform] handleInit called, walletAddress:', walletAddress);
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
      }
      const res = await base44.functions.invoke('initPlatformV2', { walletAddress });
      console.log('[InitPlatform] initPlatformV2 response:', res.data);
      if (res.data.error) throw new Error(res.data.error);
      
      // If already initialized, just refresh the status
      if (res.data.alreadyInitialized || res.data.alreadyExists) {
        await refetch();
        setInstruction(null);
        setError(null);
        const msg = res.data.message || 'Platform is already initialized!';
        alert(msg + ' You can start creating markets in the Admin panel.');
        return;
      }
      
      setInstruction(res.data.solana_instruction);
      setError(null);
    } catch (err) {
      console.error('[InitPlatform] handleInit error:', err);
      setError(err.message);
    }
  };

  const handleSuccess = async () => {
    setInstruction(null);
    setError(null);
    await refetch();
    alert('Platform V2 initialized successfully! You can now create markets.');
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-heading font-bold text-2xl">Platform Initialization</h1>
        
        {platformStatus?.data?.initialized ? (
          <Card className="bg-accent/10 border-accent/30">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-accent" />
                <div>
                  <p className="font-bold text-accent">✓ Platform is Fully Initialized</p>
                  <p className="text-sm text-accent-foreground">
                    Fee Vault: {platformStatus.data.feeVaultPda?.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
                <p className="text-xs text-accent-foreground font-bold mb-1">You're all set! Here's what to do next:</p>
                <ol className="text-xs text-accent-foreground list-decimal list-inside space-y-1">
                  <li>Go to the <strong>Admin</strong> page</li>
                  <li>Click the <strong>Matches</strong> tab</li>
                  <li>Click <strong>"Initialize Market"</strong> for each match you want to offer</li>
                  <li>Start accepting bets on your markets!</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-6 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
              <div>
                <p className="font-bold text-destructive">Platform not initialized</p>
                <p className="text-sm text-muted-foreground">
                  Markets cannot be created until platform config is set up
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-4 space-y-2">
              <p className="text-destructive text-sm font-bold">Error: {error}</p>
              {(error.includes('2006') || error.includes('AlreadyInitialized') || error.includes('already initialized')) && (
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 mt-2">
                  <p className="text-xs text-accent font-bold mb-1">✓ Good News - Platform Already Initialized!</p>
                  <p className="text-xs text-accent-foreground">
                    Error 2006 means the platform config <strong>already exists</strong> on-chain. This is expected after the first initialization!
                  </p>
                  <p className="text-xs text-accent-foreground mt-2 font-bold">
                    What to do next:
                  </p>
                  <ol className="text-xs text-accent-foreground list-decimal list-inside mt-1 space-y-1">
                    <li>Go to the <strong>Admin</strong> page (use the navigation menu)</li>
                    <li>Click on the <strong>Matches</strong> tab</li>
                    <li>Find your match and click <strong>"Initialize Market"</strong> button</li>
                    <li>Once the market is created on-chain, you can start accepting bets!</li>
                  </ol>
                  <p className="text-xs text-accent-foreground mt-3 italic">
                    Note: Platform initialization is a one-time setup. You're all set to create markets!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <h2 className="font-heading font-bold text-lg">Solana Program ID</h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSecretDialog(true)}
                className="h-8 text-xs"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Update Secret
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Current program ID being used by the app:
            </p>
            <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs break-all flex items-center justify-between gap-2">
              <span>{programIdData?.currentProgramId || 'Loading...'}</span>
              {programIdData?.currentProgramId && (
                <button
                  onClick={() => copyToClipboard(programIdData.currentProgramId)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}
            </div>
            {platformStatus?.data?.admin && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  <strong>On-chain admin wallet:</strong>
                </p>
                <div className="font-mono text-xs break-all flex items-center justify-between gap-2">
                  <span>{platformStatus.data.admin}</span>
                  <button
                    onClick={() => copyToClipboard(platformStatus.data.admin)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {showSecretDialog && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-card border-border/50 max-w-lg w-full">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-bold text-lg">Update Program ID Secret</h3>
                  <button
                    onClick={() => setShowSecretDialog(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    <strong>Quick Steps:</strong>
                  </p>
                  <ol className="list-decimal list-inside text-sm space-y-2 text-muted-foreground">
                    <li>Open Base44 Dashboard in a new tab</li>
                    <li>Go to <strong>Code → Secrets</strong></li>
                    <li>Find <code className="bg-muted px-1 rounded">SOLANA_PROGRAM_ID</code></li>
                    <li>Click edit and paste the correct program ID</li>
                    <li>Save and return here to reload</li>
                  </ol>
                </div>

                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <p className="text-xs text-destructive font-bold mb-1">⚠️ Important:</p>
                  <p className="text-xs text-destructive">
                    Make sure the program ID matches the one that owns your platform account on-chain. 
                    If you deployed a new contract, update this secret first.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      window.open('https://app.base44.com', '_blank');
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Dashboard
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setShowSecretDialog(false);
                      window.location.reload();
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reload Page
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!isConnected ? (
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-6 text-center space-y-4">
              <p className="text-muted-foreground">Connect your Phantom wallet to initialize the platform</p>
              <Button
                onClick={connect}
                className="h-12 px-8"
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>🦊 Connect Phantom Wallet</>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : instruction ? (
          <SolanaTransactionSigner
            instruction={instruction}
            amount="0"
            isPlatformInit={true}
            onSuccess={handleSuccess}
            onError={() => setError('Transaction failed')}
          />
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handleRegisterAdmin}
              className="w-full h-12"
              variant="outline"
            >
              🔑 Register This Wallet as Admin
            </Button>
            <Button
              onClick={handleInit}
              className="w-full h-12"
            >
              🚀 Initialize Platform V2 (Fresh Start)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}