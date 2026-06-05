import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { motion } from 'framer-motion';
import { Trophy, Flag, TrendingUp, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function FuturesLPPanel({ onSuccess, onError }) {
  const { isConnected, connect, walletAddress } = useWallet();
  const queryClient = useQueryClient();
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [amount, setAmount] = useState('');
  const [pendingTx, setPendingTx] = useState(null);
  const [pendingCommitData, setPendingCommitData] = useState(null);
  const [error, setError] = useState(null);

  const { data: futuresMarkets = [] } = useQuery({
    queryKey: ['futuresMarkets'],
    queryFn: () => base44.entities.FuturesMarket.list(),
  });

  // Separate test markets from real markets
  const testMarkets = futuresMarkets.filter(m => m.title?.includes('Quick Test') || m.title?.includes('Future Test'));
  const realMarkets = futuresMarkets.filter(m => !m.title?.includes('Quick Test') && !m.title?.includes('Future Test'));

  const provideFuturesLiquidityMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!selectedMarket) throw new Error('No market selected');
      if (!selectedOutcome) throw new Error('No outcome selected');
      if (!walletAddress) throw new Error('Wallet not connected');

      const res = await base44.functions.invoke('provideFuturesLiquidity', {
        walletAddress,
        market_id: selectedMarket.id,
        outcome_label: selectedOutcome.label,
        outcome_flag: selectedOutcome.flag,
        odds: selectedOutcome.odds,
        amount: amt,
      });

      if (res.data.error) throw new Error(res.data.error);
      if (!res.data.solana_instruction) {
        throw new Error('Futures market not initialized on-chain. Please initialize from Admin panel.');
      }
      return res.data;
    },
    onSuccess: (data) => {
      setPendingTx({
        instruction: data.solana_instruction,
        amount: parseFloat(amount),
        type: 'provide_futures_liquidity',
      });
      setPendingCommitData(data.commit_data);
    },
    onError: (err) => {
      console.error('[FuturesLP] LP mutation error:', err);
      setError(err.message || 'Failed to provide liquidity');
    },
  });

  const handleTxSuccess = async (txResult) => {
    const signature = txResult.signature;
    const committedAmount = parseFloat(amount);
    
    if (pendingCommitData) {
      try {
        const commitRes = await base44.functions.invoke('commitFuturesLiquidity', {
          signature,
          commit_data: pendingCommitData,
        });
        if (commitRes.data.error) {
          console.error('[FuturesLP] commit error:', commitRes.data.error);
        }
      } catch (err) {
        console.error('[FuturesLP] commit threw:', err);
      }
    }
    
    onSuccess?.({
      signature,
      amount: committedAmount,
      team: selectedOutcome.label,
      market: selectedMarket.title,
    });
    
    setPendingTx(null);
    setAmount('');
    setSelectedMarket(null);
    setSelectedOutcome(null);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
  };

  const handleTxError = (err) => {
    console.error('Futures LP transaction failed:', err);
    setPendingTx(null);
  };

  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/20 p-8 text-center"
        style={{ background: '#1c1c1c' }}>
        <Trophy className="w-12 h-12 text-primary mx-auto mb-4" />
        <h3 className="font-heading font-black text-xl text-white mb-2">Connect Wallet for Futures LP</h3>
        <p className="text-white/50 text-sm mb-5 max-w-xs mx-auto">Connect your Phantom wallet to provide liquidity for World Cup futures.</p>
        <Button onClick={connect} className="font-heading font-bold px-8 h-11 rounded-xl"
          style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
          Connect Phantom
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <AlertDescription className="text-destructive text-sm">
            {error}
            <Button variant="link" className="p-0 h-auto text-destructive underline ml-2" onClick={() => setError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {pendingTx ? (
        <SolanaTransactionSigner
          instruction={pendingTx.instruction}
          amount={pendingTx.amount}
          onSuccess={handleTxSuccess}
          onError={handleTxError}
        />
      ) : (
        <>
          {/* Test Markets Section */}
          {testMarkets.length > 0 && (
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1.5 block font-bold text-emerald-400">⚡ Quick Test Markets</label>
              <div className="grid grid-cols-1 gap-2">
                {testMarkets.map(market => (
                  <button
                    key={market.id}
                    onClick={() => {
                      setSelectedMarket(market);
                      setSelectedOutcome(null);
                      setError(null);
                    }}
                    className={`rounded-xl p-3 border-2 text-left transition-all ${
                      selectedMarket?.id === market.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-border/50 bg-secondary/30 hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{market.icon}</span>
                      <div>
                        <span className="font-heading font-bold text-sm text-white">{market.title}</span>
                        <p className="text-[10px] text-muted-foreground">{market.subtitle}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Real Markets Section */}
          {realMarkets.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-bold">🏆 World Cup Markets</label>
              <div className="grid grid-cols-1 gap-2">
                {realMarkets.map(market => (
                  <button
                    key={market.id}
                    onClick={() => {
                      setSelectedMarket(market);
                      setSelectedOutcome(null);
                      setError(null);
                    }}
                    className={`rounded-xl p-3 border-2 text-left transition-all ${
                      selectedMarket?.id === market.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 bg-secondary/30 hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{market.icon}</span>
                      <div>
                        <span className="font-heading font-bold text-sm text-white">{market.title}</span>
                        <p className="text-[10px] text-muted-foreground">{market.subtitle}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedMarket && (
            <>
              {/* Outcome cards */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Select Team to Back (LP bets AGAINST this outcome)</label>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {selectedMarket.outcomes?.map((outcome, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedOutcome(outcome)}
                      className={`rounded-xl p-3 border-2 text-left transition-all ${
                        selectedOutcome?.label === outcome.label
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 bg-secondary/30 hover:border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{outcome.flag}</span>
                        <span className="font-heading font-bold text-xs">{outcome.label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Odds</span>
                        <span className="text-primary font-bold text-sm">{outcome.odds.toFixed(2)}x</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedOutcome && (
                <>
                  {/* LP explanation */}
                  <div className="bg-[#1c1c1c] rounded-xl p-3 text-xs space-y-1.5 border border-border/50">
                    <p className="font-bold text-foreground">Futures LP Explained:</p>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">
                        <span className="text-accent font-bold">Your Role:</span> You're betting <span className="text-destructive font-bold">AGAINST</span> <span className="text-foreground font-medium">{selectedOutcome.label}</span> winning.
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-accent font-bold">You Commit:</span> ◎{amount || '0'} SOL
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-green-400 font-bold">You Win If:</span> {selectedOutcome.label} <span className="text-destructive font-bold">DOES NOT WIN</span> → You keep your full stake.
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-destructive font-bold">You Lose If:</span> {selectedOutcome.label} <span className="text-green-400 font-bold">WINS</span> → Bettors get paid {selectedOutcome.odds.toFixed(2)}x from your stake.
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-yellow-400 font-bold">Example:</span> If you commit ◎100 SOL at {selectedOutcome.odds.toFixed(2)}x odds and {selectedOutcome.label} loses, you keep ◎100. If they win, you pay out ◎{selectedOutcome.odds.toFixed(2) * 100} SOL.
                      </p>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Amount (◎ SOL)</label>
                    <Input type="number" placeholder="0.00" value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
                    <div className="flex gap-2 mt-2">
                      {[1, 5, 10, 25].map(qa => (
                        <button key={qa} onClick={() => setAmount(String(qa))}
                          className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg">◎{qa}</button>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => provideFuturesLiquidityMutation.mutate()}
                    disabled={!amount || parseFloat(amount) <= 0 || provideFuturesLiquidityMutation.isPending}
                    className="w-full h-12 font-heading font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                    {provideFuturesLiquidityMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : `Commit ◎${parseFloat(amount) || 0} to ${selectedOutcome.label}`}
                  </Button>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}