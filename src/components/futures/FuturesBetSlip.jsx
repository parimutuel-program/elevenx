import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trophy, TrendingUp, Loader, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { useWallet } from '@/lib/WalletContext';

export default function FuturesBetSlip({ market, outcome, onClose, onConfirm }) {
  const { walletAddress, isConnected } = useWallet();
  const [amount, setAmount] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [instruction, setInstruction] = useState(null);
  const [commitData, setCommitData] = useState(null);

  const numericAmount = parseFloat(amount) || 0;
  const potentialPayout = numericAmount * (outcome.odds || 0);
  
  // Max bet is the LP pool amount for this outcome
  const maxBetAmount = outcome.pool || 0;
  const hasLiquidity = maxBetAmount > 0;

  const handlePrepareBet = async () => {
    if (!amount || numericAmount <= 0) return;
    if (!isConnected || !walletAddress) {
      alert('Please connect your Phantom wallet first');
      return;
    }
    
    console.log('[FuturesBetSlip] Preparing bet:', {
      marketId: market?.id,
      market,
      outcome,
      amount: numericAmount,
      walletAddress,
    });
    
    setIsPreparing(true);
    try {
      // Call backend to prepare bet and get Solana instruction
      const res = await onConfirm({
        market,
        outcome,
        amount: numericAmount,
        potentialPayout,
        walletAddress,
      });
      
      console.log('[FuturesBetSlip] Backend response:', res);
      
      if (res?.solana_instruction) {
        setInstruction(res.solana_instruction);
        setCommitData(res.commit_data);
        // Store commit data globally for SolanaTransactionSigner callback
        window.pendingFuturesCommit = {
          market,
          outcome,
          amount: numericAmount,
          potentialPayout,
          commit_data: res.commit_data,
        };
      } else if (res?.error) {
        alert('Error: ' + res.error);
      }
    } catch (error) {
      console.error('[FuturesBetSlip] Prepare bet error:', error);
      alert('Failed to prepare bet: ' + error.message);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleTransactionSuccess = async (result) => {
    console.log('Transaction success:', result);
    
    // Commit to database after on-chain success
    const pendingCommit = window.pendingFuturesCommit;
    if (pendingCommit && result.signature) {
      await onConfirm({
        market,
        outcome,
        amount: numericAmount,
        potentialPayout,
        signature: result.signature,
        commit_data: pendingCommit.commit_data,
        commitOnly: true,
      });
    }
    
    onClose();
  };

  const positionBadge = outcome.position === '1st' ? '🥇' : outcome.position === '2nd' ? '🥈' : '🥉';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border/50 rounded-3xl p-6 max-w-md w-full shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 border-2 border-primary/30 flex items-center justify-center text-2xl">
              {market.country_flag || '🏳️'}
            </div>
            <div>
              <h3 className="font-heading font-bold text-base">{market.country}</h3>
              <div className="flex items-center gap-2">
                <Badge className="text-[9px] bg-primary/15 text-primary border border-primary/25">
                  {positionBadge} {outcome.position} Place
                </Badge>
                <span className="text-[9px] text-muted-foreground">Futures</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bet Details */}
        <div className="bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Multiplier</span>
            </div>
            <span className="font-heading font-black text-2xl text-primary">
              {outcome.odds?.toFixed(2)}x
            </span>
          </div>
          <div className="pt-3 border-t border-primary/10">
            <p className="text-[10px] text-muted-foreground">
              If {market.country} finishes {outcome.position}, you win {outcome.odds?.toFixed(2)}x your stake!
            </p>
          </div>
        </div>

        {/* No Liquidity Warning */}
        {!hasLiquidity && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-destructive" />
              <span className="text-xs font-bold text-destructive">No Liquidity Available</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              There are no LP offers for this outcome yet. Wait for a liquidity provider to add funds, or become an LP yourself!
            </p>
          </div>
        )}

        {/* Amount Input with Max Button */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-bold">Stake Amount (SOL)</Label>
            {maxBetAmount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Available: ◎{maxBetAmount.toFixed(2)} SOL
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="bg-secondary/50 text-lg font-bold h-12 rounded-xl pr-20"
              autoFocus
            />
            {maxBetAmount > 0 && (
              <button
                onClick={() => setAmount(maxBetAmount.toFixed(2))}
                className="absolute right-1 top-1 bottom-1 px-3 bg-accent/20 hover:bg-accent/30 border border-accent/30 rounded-lg text-xs font-bold text-accent transition-all"
              >
                MAX
              </button>
            )}
          </div>
          {maxBetAmount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Maximum bet: ◎{maxBetAmount.toFixed(2)} SOL (LP pool limit)
            </p>
          )}
        </div>

        {/* Payout Summary */}
        {numericAmount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-accent/5 border border-accent/20 rounded-2xl p-4 mb-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Potential Payout</span>
              <span className="font-heading font-black text-xl text-accent">
                ◎{potentialPayout.toFixed(4)} SOL
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Stake</span>
              <span className="font-bold text-sm">◎{numericAmount.toFixed(4)} SOL</span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-accent/10">
              <span className="text-xs text-muted-foreground">Profit</span>
              <span className="font-bold text-sm text-accent">
                +◎{(potentialPayout - numericAmount).toFixed(4)} SOL
              </span>
            </div>
          </motion.div>
        )}

        {/* Transaction or Actions */}
        {instruction ? (
          <div className="space-y-3">
            <SolanaTransactionSigner
              instruction={instruction}
              amount={numericAmount.toFixed(4)}
              userBetId={commitData?.userBetId}
              betId={market.id}
              isOffer={false}
              onSuccess={handleTransactionSuccess}
              onError={(err) => alert('Transaction failed: ' + err.message)}
            />
            <Button
              variant="outline"
              onClick={() => {
                setInstruction(null);
                setCommitData(null);
              }}
              className="w-full h-10 rounded-xl font-bold"
            >
              Back
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePrepareBet}
              disabled={!amount || numericAmount <= 0 || isPreparing || !isConnected || !hasLiquidity}
              className="flex-1 h-11 rounded-xl font-bold bg-primary hover:bg-primary/90 disabled:bg-muted/50 disabled:text-muted-foreground"
            >
              {isPreparing ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Preparing...
                </>
              ) : !isConnected ? (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect Wallet
                </>
              ) : !hasLiquidity ? (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  No LP Available
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 mr-2" />
                  Place Bet
                </>
              )}
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}