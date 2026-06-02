import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function ProvideLiquidityPanel({ bet, match, match_id }) {
  const { isConnected, connect } = useWallet();
  const [marketStatus, setMarketStatus] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('a');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [instruction, setInstruction] = useState(null);
  const [showSigner, setShowSigner] = useState(false);
  const [createMarketMutation, setCreateMarketMutation] = useState({ isPending: false });
  const [isInitializingPlatform, setIsInitializingPlatform] = useState(false);

  useEffect(() => {
    checkMarketStatus();
  }, [match_id]);

  const checkMarketStatus = async () => {
    try {
      console.log('[ProvideLiquidityPanel] Checking market status for match:', match_id);
      // Add timestamp to prevent caching
      const response = await base44.functions.invoke('checkMarketStatus', { 
        match_id,
        _t: Date.now(), // Cache buster
      });
      console.log('[ProvideLiquidityPanel] Market status response:', response.data);
      setMarketStatus(response.data);
    } catch (err) {
      console.error('[ProvideLiquidityPanel] checkMarketStatus error:', err);
      setMarketStatus({ status: 'error', message: err.message });
    }
  };

  const handleCreateMarket = async () => {
    setCreateMarketMutation({ isPending: true });
    setError(null);
    try {
      console.log('[ProvideLiquidityPanel] Creating market on-chain for bet:', bet.id, 'match:', match_id);
      const response = await base44.functions.invoke('createMarketOnChain', {
        bet_id: bet.id,
        match_id,
      });
      
      console.log('[ProvideLiquidityPanel] createMarketOnChain response:', response.data);
      
      // Check if platform needs initialization
      if (response.data.needsPlatformInit && response.data.solana_instruction) {
        console.log('[ProvideLiquidityPanel] Platform config not initialized - showing init transaction');
        const instr = {
          ...response.data.solana_instruction,
          needsPlatformInit: true,
        };
        setInstruction(instr);
        setIsInitializingPlatform(true);
        setShowSigner(true);
        setCreateMarketMutation({ isPending: false });
        return;
      }
      
      if (response.data.error) {
        setError(response.data.error);
        setCreateMarketMutation({ isPending: false });
        return;
      }
      
      if (response.data.solana_instruction) {
        console.log('[ProvideLiquidityPanel] Setting instruction for market creation:', response.data.solana_instruction);
        const instr = {
          ...response.data.solana_instruction,
          amount: 0,
        };
        setInstruction(instr);
        setShowSigner(true);
      } else {
        console.log('[ProvideLiquidityPanel] Market already exists, refreshing status');
        await checkMarketStatus();
      }
    } catch (err) {
      console.error('[ProvideLiquidityPanel] handleCreateMarket error:', err);
      setError(err.message || 'Failed to create market');
    } finally {
      setCreateMarketMutation({ isPending: false });
    }
  };

  const handleProvideLiquidity = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const walletAddress = localStorage.getItem('solana_wallet');
      const response = await base44.functions.invoke('provideLiquidity', {
        walletAddress,
        bet_id: bet.id,
        match_id,
        outcome: selectedOutcome,
        amount: parseFloat(amount),
      });

      if (response.data.error) {
        setError(response.data.error);
        setInstruction(null);
      } else {
        setInstruction(response.data.solana_instruction);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransactionSuccess = async ({ signature, status, isPlatformInit }) => {
    try {
      console.log('Transaction successful:', signature, 'isPlatformInit:', isPlatformInit);
      setInstruction(null);
      setShowSigner(false);
      
      if (isPlatformInit) {
        setIsInitializingPlatform(false);
        console.log('Platform initialized, waiting 8 seconds before creating market...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        console.log('Now creating market...');
        setError(null);
        await handleCreateMarket();
        return;
      }
      
      // Market creation transaction confirmed
      console.log('Market creation transaction confirmed, waiting 8 seconds for Solana to propagate...');
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Force multiple fresh checks with delays
      console.log('Checking market status (attempt 1)...');
      const response = await base44.functions.invoke('checkMarketStatus', { match_id, _t: Date.now() });
      console.log('Market status:', response.data);
      setMarketStatus(response.data);
      
      if (response.data.status === 'initialized') {
        console.log('SUCCESS: Market is initialized!');
        return;
      }
      
      // If still not ready, wait more and retry
      console.log('Market not ready, waiting 5 more seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('Checking market status (attempt 2)...');
      const retryResponse = await base44.functions.invoke('checkMarketStatus', { match_id, _t: Date.now() });
      console.log('Retry market status:', retryResponse.data);
      setMarketStatus(retryResponse.data);
      
      if (retryResponse.data.status === 'initialized') {
        console.log('SUCCESS: Market is now initialized!');
      } else {
        console.log('Market still not initialized after retry. Check Solana explorer.');
      }
    } catch (err) {
      console.error('Failed to finalize:', err);
      setError(err.message);
    }
  };

  const outcomeLabel = selectedOutcome === 'a' ? bet.outcome_a : selectedOutcome === 'b' ? bet.outcome_b : 'Draw';
  const oddsField = selectedOutcome === 'a' ? 'oracle_odds_a' : selectedOutcome === 'b' ? 'oracle_odds_b' : 'oracle_odds_draw';
  const oddsBps = bet[oddsField] || 200;

  if (!marketStatus) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Debug info
  console.log('[ProvideLiquidityPanel] Current market status:', marketStatus);

  if (marketStatus.status === 'not_created') {
    return (
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3">
          <p className="font-bold mb-1">Market Status: Not Created</p>
          <p>PDA: {marketStatus.marketPda?.slice(0, 40)}...</p>
        </div>
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          <AlertDescription className="text-sm text-yellow-500">
            Market not created on-chain. Click below to initialize.
          </AlertDescription>
        </Alert>
        
        {showSigner && instruction ? (
          <SolanaTransactionSigner
            instruction={instruction}
            amount={0}
            isPlatformInit={isInitializingPlatform}
            onSuccess={handleTransactionSuccess}
            onError={(err) => setError(err.message)}
          />
        ) : (
          <>
            <Button
              onClick={handleCreateMarket}
              disabled={createMarketMutation.isPending}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl"
            >
              {createMarketMutation.isPending ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Creating Market...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Market On-Chain
                </>
              )}
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  const res = await base44.functions.invoke('debugMarketAccount', { match_id });
                  console.log('DEBUG MARKET ACCOUNT:', res.data);
                  alert('Debug info logged to console. Check browser console (F12).');
                }}
                variant="outline"
                className="flex-1 border-destructive/50 text-destructive text-xs"
              >
                Debug: Market PDA
              </Button>
              <Button
                onClick={async () => {
                  const res = await base44.functions.invoke('debugMarketAccount', { match_id: 'platform' });
                  console.log('DEBUG PLATFORM CONFIG:', res.data);
                  alert('Platform config debug logged to console. Check browser console (F12).');
                }}
                variant="outline"
                className="flex-1 border-yellow-500/50 text-yellow-500 text-xs"
              >
                Debug: Platform
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (marketStatus.status === 'not_initialized') {
    return (
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3">
          <p className="font-bold mb-1">Market Status: Not Initialized</p>
          <p>PDA: {marketStatus.marketPda?.slice(0, 40)}...</p>
          <p>Size: {marketStatus.actualSize} bytes (expected: {marketStatus.expectedMinSize})</p>
          <p>Owner: {marketStatus.owner?.slice(0, 30)}...</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">
            Market account exists but is not properly initialized.
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          This may be due to a failed transaction. Please try creating the market again.
        </p>
        {showSigner && instruction ? (
          <SolanaTransactionSigner
            instruction={instruction}
            amount={0}
            isPlatformInit={isInitializingPlatform}
            onSuccess={handleTransactionSuccess}
            onError={(err) => setError(err.message)}
          />
        ) : (
          <Button
            onClick={handleCreateMarket}
            disabled={createMarketMutation.isPending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl"
          >
            {createMarketMutation.isPending ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Retry Create Market
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {marketStatus.status === 'initialized' && (
        <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-3">
          <p className="font-bold text-accent mb-1">✓ Market Active On-Chain</p>
          <p>PDA: {marketStatus.marketPda?.slice(0, 40)}...</p>
          <p>Size: {marketStatus.size} bytes</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Select Outcome</label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={selectedOutcome === 'a' ? 'default' : 'outline'}
            onClick={() => setSelectedOutcome('a')}
            className="flex-1"
          >
            {bet.outcome_a}
          </Button>
          <Button
            variant={selectedOutcome === 'b' ? 'default' : 'outline'}
            onClick={() => setSelectedOutcome('b')}
            className="flex-1"
          >
            {bet.outcome_b}
          </Button>
          <Button
            variant={selectedOutcome === 'draw' ? 'default' : 'outline'}
            onClick={() => setSelectedOutcome('draw')}
            className="flex-1"
          >
            Draw
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Amount (SOL)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0.01"
          className="w-full px-3 py-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {amount && (
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Outcome: <span className="text-foreground font-medium">{outcomeLabel}</span></p>
          <p>Odds: <span className="text-foreground font-medium">{(oddsBps / 100).toFixed(2)}x</span></p>
          <p>Potential return: <span className="text-foreground font-medium">{(parseFloat(amount) * (oddsBps / 100)).toFixed(2)} SOL</span></p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {showSigner && instruction ? (
        <SolanaTransactionSigner
          instruction={instruction}
          amount={instruction.instruction_type === 'create_market' ? 0 : amount}
          onSuccess={handleTransactionSuccess}
          onError={(err) => setError(err.message)}
        />
      ) : (
        <Button
          className="w-full"
          onClick={handleProvideLiquidity}
          disabled={isLoading || !amount || parseFloat(amount) <= 0}
        >
          {isLoading ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Provide Liquidity'
          )}
        </Button>
      )}
    </div>
  );
}