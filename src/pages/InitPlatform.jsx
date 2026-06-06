import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle, Key } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function InitPlatform() {
  const { isConnected, connect } = useWallet();
  const [instruction, setInstruction] = useState(null);
  const [error, setError] = useState(null);
  const { walletAddress } = useWallet();
  const [newProgramId, setNewProgramId] = useState('');
  const [isUpdatingProgramId, setIsUpdatingProgramId] = useState(false);
  const [programIdUpdateResult, setProgramIdUpdateResult] = useState(null);

  const { data: platformStatus } = useQuery({
    queryKey: ['platformStatus'],
    queryFn: () => base44.functions.invoke('checkPlatformConfig', {}),
  });

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

  const handleUpdateProgramId = async () => {
    if (!newProgramId.trim()) {
      setError('Please enter a valid program ID');
      return;
    }

    setIsUpdatingProgramId(true);
    setError(null);

    try {
      // Validate it's a valid Solana address format
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!base58Regex.test(newProgramId.trim())) {
        throw new Error('Invalid Solana address format. Must be 32-44 base58 characters.');
      }

      const res = await base44.functions.invoke('solanaConfig', { 
        action: 'update_program_id',
        newProgramId: newProgramId.trim()
      });

      if (res.data.error) {
        throw new Error(res.data.error);
      }

      setProgramIdUpdateResult({
        success: true,
        oldId: res.data.oldProgramId,
        newId: res.data.newProgramId,
      });
      setNewProgramId('');
    } catch (err) {
      setError(err.message);
      setProgramIdUpdateResult(null);
    } finally {
      setIsUpdatingProgramId(false);
    }
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
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-5 h-5 text-primary" />
              <h2 className="font-heading font-bold text-lg">Update Solana Program ID</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              After deploying a new contract, update the program ID here instead of going to the dashboard.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="programId">New Program ID</Label>
              <Input
                id="programId"
                placeholder="e.g., 4TCfhcrrn6dZjTVhrhbvQu21Euc7tfF1bkBNcT7kzptd"
                value={newProgramId}
                onChange={(e) => setNewProgramId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {programIdUpdateResult && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
                <p className="text-accent text-sm font-bold">✓ Program ID Updated!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Old: {programIdUpdateResult.oldId?.slice(0, 8)}...{programIdUpdateResult.oldId?.slice(-8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  New: {programIdUpdateResult.newId?.slice(0, 8)}...{programIdUpdateResult.newId?.slice(-8)}
                </p>
              </div>
            )}

            <Button
              onClick={handleUpdateProgramId}
              disabled={isUpdatingProgramId || !newProgramId.trim()}
              className="w-full"
            >
              {isUpdatingProgramId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>Update Program ID</>
              )}
            </Button>
          </CardContent>
        </Card>

        {instruction ? (
          <SolanaTransactionSigner
            instruction={instruction}
            amount="0"
            isPlatformInit={true}
            onSuccess={handleSuccess}
            onError={() => setError('Transaction failed')}
          />
        ) : (
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
        )}
      </div>
    </div>
  );
}