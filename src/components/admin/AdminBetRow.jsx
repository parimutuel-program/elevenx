import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Trophy, RefreshCw, CheckCircle, CheckCircle2, Gavel } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function AdminBetRow({ bet, matches, index }) {
  const queryClient = useQueryClient();
  const match = matches.find(m => m.id === bet.match_id);
  const [pendingRecreate, setPendingRecreate] = useState(null);
  const [pendingSettle, setPendingSettle] = useState(null);

  const { data: marketStatus, error: marketError } = useQuery({
    queryKey: ['marketStatus', match?.id],
    queryFn: async () => {
      console.log('[AdminBetRow] Fetching market status for:', match.id);
      const res = await base44.functions.invoke('checkMarketStatus', { match_id: match.id });
      console.log('[AdminBetRow] Market status response:', res.data);
      return res.data;
    },
    enabled: !!match,
    refetchInterval: 5000,
  });

  console.log('[AdminBetRow] Render:', { match_id: match?.id, marketStatus, marketError });

  const isMarketInitialized = bet.solana_market_created || marketStatus?.status === 'initialized' || marketStatus?.status === 'settled';
  const isMarketSettled = marketStatus?.status === 'settled' || marketStatus?.settled === true;
  
  React.useEffect(() => {
    if (marketStatus) {
      console.log('[AdminBetRow] Market status for', bet.match_id, ':', marketStatus);
    }
    if (marketError) {
      console.error('[AdminBetRow] Market status error:', marketError);
    }
  }, [marketStatus, marketError, bet.match_id]);

  const recreateMarketMutation = useMutation({
    mutationFn: ({ bet_id, match_id }) => base44.functions.invoke('createMarketOnChain', {
      bet_id,
      match_id,
      force_recreate: true,
    }),
    onSuccess: (response) => {
      const data = response.data;
      if (data.solana_instruction) {
        setPendingRecreate(data.solana_instruction);
      } else {
        alert(data.message || 'Market recreated');
      }
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['marketStatus', match?.id] });
    },
  });

  const handleRecreateSuccess = () => {
    setPendingRecreate(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    queryClient.invalidateQueries({ queryKey: ['marketStatus', match?.id] });
    alert('Market recreated on-chain!');
  };

  const handleRecreateError = (err) => {
    setPendingRecreate(null);
    alert('Market recreation failed: ' + err.message);
  };

  const settleOnChainMutation = useMutation({
    mutationFn: async (winningOutcome) => {
      const onChainRes = await base44.functions.invoke('settleMarketOnChain', {
        bet_id: bet.id,
        match_id: bet.match_id,
        winning_outcome: winningOutcome,
      });
      if (!onChainRes.data.success) throw new Error(onChainRes.data.error || 'On-chain settlement failed');
      return { solana_instruction: onChainRes.data.solana_instruction };
    },
    onSuccess: (data) => {
      if (data.solana_instruction) {
        setPendingSettle(data.solana_instruction);
      } else {
        queryClient.invalidateQueries({ queryKey: ['bets'] });
        queryClient.invalidateQueries({ queryKey: ['myBets'] });
        alert('Market settled on-chain!');
      }
    },
  });

  const handleSettleSuccess = () => {
    setPendingSettle(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
    alert('✓ Market settled on-chain! Players can now claim winnings.');
  };

  const handleSettleError = (err) => {
    setPendingSettle(null);
    alert('Settlement failed: ' + err.message);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="p-4 bg-card border border-border/50 rounded-xl"
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-heading font-bold text-sm">{bet.outcome_a} vs {bet.outcome_b}</p>
          <p className="text-[10px] text-muted-foreground">
            Fixed odds: 2.1x each · Pool: ◎{(bet.total_pool || 0).toFixed(2)} · {bet.total_bettors || 0} bets
          </p>
          <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
            <span className="text-primary font-bold">{bet.outcome_a}: 2.10x</span>
            <span className="text-yellow-400 font-bold">Draw: 2.10x</span>
            <span className="text-accent font-bold">{bet.outcome_b}: 2.10x</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMarketSettled && (
            <Badge className="bg-accent/20 text-accent text-[10px] py-1 px-3 rounded-lg">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Settled On-Chain
            </Badge>
          )}
          {isMarketInitialized && !isMarketSettled && (
            <Badge className="bg-primary/20 text-primary text-[10px] py-1 px-3 rounded-lg">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Market Initialized
            </Badge>
          )}
          {pendingRecreate ? (
            <div className="w-64">
              <SolanaTransactionSigner
                instruction={pendingRecreate}
                amount={0}
                onSuccess={handleRecreateSuccess}
                onError={handleRecreateError}
              />
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm('Recreate market on-chain with updated odds?')) {
                  recreateMarketMutation.mutate({ bet_id: bet.id, match_id: bet.match_id });
                }
              }}
              disabled={recreateMarketMutation.isPending}
              className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 rounded-lg"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Recreate
            </Button>
          )}
          <Badge className={`text-[10px] ${
            bet.status === 'open' ? 'bg-accent/20 text-accent' :
            bet.status === 'settled' ? 'bg-primary/20 text-primary' :
            bet.status === 'void' ? 'bg-destructive/20 text-destructive' :
            'bg-secondary text-secondary-foreground'
          }`}>
            {bet.status}
          </Badge>
        </div>
      </div>

      {bet.status === 'open' || bet.status === 'closed' ? (
        <div className="space-y-2 mt-2">
          {pendingSettle ? (
            <div className="w-full">
              <SolanaTransactionSigner
                instruction={pendingSettle}
                amount={0}
                onSuccess={handleSettleSuccess}
                onError={handleSettleError}
              />
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => settleOnChainMutation.mutate('a')} disabled={settleOnChainMutation.isPending}
                className="h-8 text-xs bg-primary/20 text-primary hover:bg-primary/30 rounded-lg flex-1">
                <Trophy className="w-3 h-3 mr-1" /> {bet.outcome_a}
              </Button>
              <Button size="sm" onClick={() => settleOnChainMutation.mutate('draw')} disabled={settleOnChainMutation.isPending}
                className="h-8 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg flex-1">
                <Trophy className="w-3 h-3 mr-1" /> Draw
              </Button>
              <Button size="sm" onClick={() => settleOnChainMutation.mutate('b')} disabled={settleOnChainMutation.isPending}
                className="h-8 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg flex-1">
                <Trophy className="w-3 h-3 mr-1" /> {bet.outcome_b}
              </Button>
            </div>
          )}
        </div>
      ) : bet.status === 'settled' ? (
        <div className="space-y-2 mt-2">
          <p className="text-xs text-muted-foreground">
            Winner: <span className="text-primary font-bold">
              {bet.winning_outcome === 'a' ? bet.outcome_a : bet.winning_outcome === 'b' ? bet.outcome_b : 'Draw'}
            </span>
          </p>
          {/* DEBUG: Remove after testing */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 text-[9px] font-mono">
            <div>marketStatus: {JSON.stringify(marketStatus, null, 2)}</div>
            <div>isMarketSettled: {String(isMarketSettled)}</div>
            <div>marketError: {marketError?.message || 'none'}</div>
          </div>
          {isMarketSettled ? (
            <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-center">
              <p className="text-xs text-accent font-bold">✓ Market Settled On-Chain</p>
              <p className="text-[10px] text-accent/80 mt-1">Players can now claim winnings</p>
            </div>
          ) : (
            pendingSettle ? (
              <div className="w-full">
                <SolanaTransactionSigner
                  instruction={pendingSettle}
                  amount={0}
                  onSuccess={handleSettleSuccess}
                  onError={handleSettleError}
                />
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => settleOnChainMutation.mutate(bet.winning_outcome)}
                disabled={settleOnChainMutation.isPending}
                className="h-8 text-xs bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg w-full font-bold"
              >
                <Gavel className="w-3 h-3 mr-1" /> Settle On-Chain (Enable Claims)
              </Button>
            )
          )}
        </div>
      ) : null}
    </motion.div>
  );
}