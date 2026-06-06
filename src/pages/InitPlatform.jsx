import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertTriangle, Key, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function InitPlatform() {
  const { isConnected, connect } = useWallet();
  const [instruction, setInstruction] = useState(null);
  const [error, setError] = useState(null);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const { walletAddress } = useWallet();

  const { data: platformStatus } = useQuery({
    queryKey: ['platformStatus'],
    queryFn: () => base44.functions.invoke('checkPlatformConfig', {}),
  });

  const { data: programIdData } = useQuery({
    queryKey: ['programId'],
    queryFn: () => base44.functions.invoke('solanaConfig', {}),
  });

  const handleRegisterAdmin = async () => {
    try {
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }
      const res = await base44.functions.invoke('registerAdminWallet', { walletAddress });
      if (res.data.error) throw new Error(res.data.error);
      setError(null);
      alert(res.data.message || 'Wallet registered as admin!');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInit = async () => {
    try {
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }
      const res = await base44.functions.invoke('reinitPlatformWithWallet', { walletAddress });
      if (res.data.error) throw new Error(res.data.error);
      setInstruction(res.data.solana_instruction);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSuccess = () => {
    setInstruction(null);
    setError(null);
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
            <CardContent className="p-6 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-accent" />
              <div>
                <p className="font-bold text-accent">Platform is initialized</p>
                <p className="text-sm text-muted-foreground">
                  Fee Vault: {platformStatus.data.feeVaultPda?.slice(0, 8)}...
                </p>
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
            <CardContent className="p-4">
              <p className="text-destructive text-sm">{error}</p>
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
                    <li>Find <code className="bg-muted px-1 rounded">SOLANA__PROGRAM_ID</code></li>
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

        {instruction ? (
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
              disabled={!isConnected}
              className="w-full h-12"
              variant="outline"
            >
              {!isConnected ? (
                <>Connect Wallet First</>
              ) : (
                <>🔑 Register This Wallet as Admin</>
              )}
            </Button>
            <Button
              onClick={handleInit}
              disabled={!isConnected}
              className="w-full h-12"
            >
              {!isConnected ? (
                <>Connect Wallet First</>
              ) : platformStatus?.data?.initialized ? (
                <>Reinitialize Platform (Fix Admin)</>
              ) : (
                <>Initialize Platform</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}