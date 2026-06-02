import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader, AlertCircle, CheckCircle } from 'lucide-react';

export default function MarketStatusChecker({ matchId, onMarketReady, children }) {
  const { isConnected } = useWallet();
  const [marketStatus, setMarketStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!matchId) return;

    const checkMarket = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await base44.functions.invoke('checkMarketStatus', { match_id: matchId });
        setMarketStatus(response.data);
        
        if (response.data.status === 'initialized') {
          onMarketReady?.(true);
        } else {
          onMarketReady?.(false);
        }
      } catch (err) {
        console.error('Failed to check market status:', err);
        setError(err.message);
        onMarketReady?.(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkMarket();
  }, [matchId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Checking market status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          Failed to check market status: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (marketStatus?.status === 'not_created') {
    return (
      <div className="space-y-4">
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          <AlertDescription className="text-yellow-500">
            <p className="font-bold mb-1">Market Not Created</p>
            <p className="text-sm">This market has not been created on-chain yet.</p>
            <p className="text-sm mt-2">Market PDA: <code className="text-xs">{marketStatus.marketPda}</code></p>
          </AlertDescription>
        </Alert>
        <Button 
          className="w-full"
          onClick={() => window.dispatchEvent(new CustomEvent('create-market', { detail: { matchId } }))}
        >
          Create Market On-Chain
        </Button>
      </div>
    );
  }

  if (marketStatus?.status === 'not_initialized') {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            <p className="font-bold mb-1">Market Initialization Failed</p>
            <p className="text-sm">The market account exists but was not properly initialized.</p>
            <p className="text-sm mt-2">Size: {marketStatus.actualSize} bytes (expected: {marketStatus.expectedSize}+)</p>
            <p className="text-sm">Market PDA: <code className="text-xs">{marketStatus.marketPda}</code></p>
          </AlertDescription>
        </Alert>
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          <AlertDescription className="text-yellow-500 text-sm">
            This usually happens when a transaction fails mid-execution. The market needs to be recreated.
            Please contact support or try creating a new bet for this match.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (marketStatus?.status === 'initialized') {
    return (
      <>
        <div className="flex items-center gap-2 text-accent text-sm mb-4">
          <CheckCircle className="w-4 h-4" />
          <span>Market is active on-chain</span>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}