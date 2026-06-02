import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader, CheckCircle, AlertCircle } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function ProvideLiquidityPanel({ bet, match, match_id }) {
  const { isConnected, connect } = useWallet();
  const [marketStatus, setMarketStatus] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('a');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [instruction, setInstruction] = useState(null);

  useEffect(() => {
    checkMarketStatus();
  }, [match_id]);

  const checkMarketStatus = async () => {
    try {
      const response = await base44.functions.invoke('checkMarketStatus', { match_id });
      setMarketStatus(response.data);
    } catch (err) {
      console.error('Failed to check market status:', err);
      setMarketStatus({ status: 'error', message: err.message });
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

  const handleTransactionSuccess = async ({ signature, status }) => {
    // Update the UserBet status to 'active' on-chain confirmation
    try {
      // The backend should have already created the UserBet, just need to confirm
      console.log('Liquidity provided successfully:', signature);
      setAmount('');
      setInstruction(null);
      // Refresh market status
      await checkMarketStatus();
    } catch (err) {
      console.error('Failed to finalize:', err);
    }
  };

  const outcomeLabel = selectedOutcome === 'a' ? bet.outcome_a : selectedOutcome === 'b' ? bet.outcome_b : 'Draw';
  const oddsField = selectedOutcome === 'a' ? 'oracle_odds_a' : selectedOutcome === 'b' ? 'oracle_odds_b' : 'oracle_odds_draw';
  const oddsBps = bet[oddsField] || 200;

  // Render based on market status
  if (!marketStatus) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (marketStatus.status === 'not_created') {
    return (
      <Alert className="border-yellow-500/50 bg-yellow-500/10">
        <AlertCircle className="w-4 h-4 text-yellow-500" />
        <AlertDescription className="text-sm text-yellow-500">
          Market not created on-chain. The market must be initialized before liquidity can be provided.
        </AlertDescription>
      </Alert>
    );
  }

  if (marketStatus.status === 'not_initialized') {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">
            Market account exists but is not properly initialized. This may be due to a failed transaction.
            <br />
            <span className="text-xs text-muted-foreground">
              Market PDA: {marketStatus.marketPda?.slice(0, 30)}...
            </span>
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Please contact support with the market PDA address to resolve this issue.
        </p>
      </div>
    );
  }

  // Market is initialized - show liquidity form
  return (
    <div className="space-y-4">
      {marketStatus.status === 'initialized' && (
        <div className="flex items-center gap-2 text-accent text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>Market active on-chain</span>
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

      {instruction ? (
        <SolanaTransactionSigner
          instruction={instruction}
          amount={amount}
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