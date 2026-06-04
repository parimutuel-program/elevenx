import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Trophy, CheckCircle2, Gavel, Database } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import RecreateMarketButton from '@/components/admin/RecreateMarketButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdminBetRow({ bet, matches, index }) {
  const queryClient = useQueryClient();
  const { walletAddress, isConnected } = useWallet();
  const match = matches.find(m => m.id === bet.match_id);
  const ADMIN_WALLET = 'BfN3J2JGFpHkfSNKP1yhC3JUKDX878RsHZuNBQjXbXDi';
  const isCorrectAdmin = isConnected && walletAddress === ADMIN_WALLET;
  const [pendingRecreate, setPendingRecreate] = useState(null);
  const [pendingSettle, setPendingSettle] = useState(null);
  const [pendingSettleOutcome, setPendingSettleOutcome] = useState(null);
  const [dbSettleOutcome, setDbSettleOutcome] = useState('a');
  const [showDbSettle, setShowDbSettle] = useState(false);


  // Debug: Log wallet state on mount and when it changes
  useEffect(() => {
    console.log('[AdminBetRow] Wallet state:', { walletAddress, isConnected, matchesAdmin: walletAddress === ADMIN_WALLET });
  }, [walletAddress, isConnected]);

  const { data: marketStatus, error: marketError, isLoading, isFetching } = useQuery({
    queryKey: ['marketStatus', match?.id],
    queryFn: async () => {
      console.log('[AdminBetRow] Fetching market status for:', match.id);
      try {
        const res = await base44.functions.invoke('checkMarketStatus', { match_id: match.id });
        console.log('[AdminBetRow] Market status response:', res.data);
        return res.data;
      } catch (err) {
        console.error('[AdminBetRow] Function call error:', err);
        // If rate limited, return a fallback status based on database state
        if (err.message?.includes('429') || err.message?.includes('rate limit')) {
          console.log('[AdminBetRow] Rate limited, using database state as fallback');
          return {
            status: bet.solana_market_created ? 'initialized' : 'not_created',
            marketPda: bet.solana_market_pda || 'unknown',
            fallback: true,
          };
        }
        throw err;
      }
    },
    enabled: !!match,
    refetchInterval: false, // Disable auto-polling to avoid rate limits
    retry: 0, // No retries on rate limit
    staleTime: Infinity, // Cache indefinitely until manual refresh
  });
  
  console.log('[AdminBetRow] Query state:', { isLoading, isFetching, hasData: !!marketStatus, hasError: !!marketError });

  console.log('[AdminBetRow] Render:', { match_id: match?.id, marketStatus, marketError });

  const isMarketInitialized = bet.solana_market_created || marketStatus?.status === 'initialized' || marketStatus?.status === 'settled';
  const isMarketSettled = marketStatus?.status === 'settled' || marketStatus?.settled === true;
  
  const handleManualRefresh = async () => {
    console.log('[AdminBetRow] Manual refresh requested for', match.id);
    await queryClient.invalidateQueries({ queryKey: ['marketStatus', match?.id] });
    await queryClient.refetchQueries({ queryKey: ['marketStatus', match?.id] });
  };
  
  useEffect(() => {
    if (marketStatus) {
      console.log('[AdminBetRow] Market status for', bet.match_id, ':', marketStatus);
    }
    if (marketError) {
      console.error('[AdminBetRow] Market status error:', marketError);
    }
  }, [marketStatus, marketError, bet.match_id]);

  const recreateMarketMutation = useMutation({
    mutationFn: ({ bet_id, match_id }) => {
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect Phantom wallet first.');
      }
      return base44.functions.invoke('recreateMarketWithValidDates', {
        bet_id,
        match_id,
        admin_wallet: walletAddress,
      });
    },
    onSuccess: (response) => {
      const data = response.data;
      if (data.steps && data.steps.length > 0) {
        // 2-step flow handled by RecreateMarketButton component
        setPendingRecreate(data);
      } else if (data.solana_instruction) {
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
    alert('✓ Market ready! Timestamps updated - you can now settle immediately.');
  };

  const handleRecreateError = (err) => {
    setPendingRecreate(null);
    alert('Market recreation failed: ' + err.message);
  };

  const settleOnChainMutation = useMutation({
    mutationFn: async (winningOutcome) => {
      console.log('[AdminBetRow] Wallet state before settlement:', { walletAddress, isConnected: !!walletAddress });
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
      }
      const payload = {
        bet_id: bet.id,
        match_id: bet.match_id,
        winning_outcome: winningOutcome,
        admin_wallet: walletAddress,
      };
      console.log('[AdminBetRow] Settling market with payload:', payload);
      console.log('[AdminBetRow] Wallet address being sent:', walletAddress);
      console.log('[AdminBetRow] Expected admin wallet: BfN3J2JGFpHkfSNKP1yhC3JUKDX878RsHZuNBQjXbXDi');
      console.log('[AdminBetRow] Wallet addresses match:', walletAddress === 'BfN3J2JGFpHkfSNKP1yhC3JUKDX878RsHZuNBQjXbXDi');
      
      try {
        const onChainRes = await base44.functions.invoke('settleMarketOnChain', payload);
        console.log('[AdminBetRow] Backend response:', onChainRes.data);
        if (!onChainRes.data.success) throw new Error(onChainRes.data.error || 'On-chain settlement failed');
        return { solana_instruction: onChainRes.data.solana_instruction, winning_outcome: winningOutcome };
      } catch (backendErr) {
        console.error('[AdminBetRow] Backend function error:', backendErr);
        console.error('[AdminBetRow] Error details:', backendErr.response?.data || backendErr.message);
        throw new Error(backendErr.response?.data?.error || backendErr.message || 'Backend function failed');
      }
    },
    onSuccess: (data) => {
      if (data.solana_instruction) {
        setPendingSettle(data.solana_instruction);
        setPendingSettleOutcome(data.winning_outcome);
      } else {
        queryClient.invalidateQueries({ queryKey: ['bets'] });
        queryClient.invalidateQueries({ queryKey: ['myBets'] });
        alert('Market settled on-chain!');
      }
    },
    onError: (err) => {
      console.error('[AdminBetRow] Settlement error:', err);
      handleSettleError(err);
    },
  });

  const handleSettleSuccess = async (result) => {
    setPendingSettle(null);
    
    // Commit settlement to database
    try {
      const commitRes = await base44.functions.invoke('commitSettlement', {
        signature: result.signature,
        commit_data: {
          bet_id: bet.id,
          match_id: bet.match_id,
          winning_outcome: pendingSettleOutcome,
        },
      });
      
      if (commitRes.data.error) {
        console.error('[AdminBetRow] Commit failed:', commitRes.data.error);
      } else {
        console.log('[AdminBetRow] Commit successful:', commitRes.data);
        alert(commitRes.data.message || '✓ Market settled! Winners can claim.');
      }
    } catch (commitErr) {
      console.error('[AdminBetRow] Commit error:', commitErr);
      alert('Settlement on-chain succeeded, but database update failed. Please contact admin.');
    }
    
    setPendingSettleOutcome(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    queryClient.invalidateQueries({ queryKey: ['myBets'] });
  };

  const handleSettleError = (err) => {
    setPendingSettle(null);
    console.error('[AdminBetRow] Settlement error:', err);
    
    // Parse error code from Solana
    let errorCode = null;
    let errorMsg = err.message;
    
    // Try to extract error code from various formats
    const errorMatch = err.message?.match(/Error\s+(\d+)/);
    if (errorMatch) {
      errorCode = errorMatch[1];
    }
    
    const errorMessages = {
      '6005': '❌ Error 6005: Unauthorized - Your wallet is NOT the admin registered in platform config',
      '3007': '❌ Error 3007: Platform not initialized',
      '0': '❌ Error 0: Betting window closed',
      '1': '❌ Error 1: Market already settled',
      '15': '❌ Error 15: Market already initialized',
      '101': '❌ Error 101: Invalid instruction data',
    };
    
    const detailedMsg = errorCode && errorMessages[errorCode] 
      ? errorMessages[errorCode] + '\n\n' + errorMsg
      : errorMsg;
    
    alert('Settlement failed:\n' + detailedMsg + '\n\nTip: Click "Debug" to check wallet mismatch');
  };

  const dbSettleMutation = useMutation({
    mutationFn: async (winningOutcome) => {
      const res = await base44.functions.invoke('commitSettlement', {
        signature: 'db-override-' + Date.now(),
        commit_data: {
          bet_id: bet.id,
          match_id: bet.match_id,
          winning_outcome: winningOutcome,
        },
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setShowDbSettle(false);
      alert(data.message || '✓ DB settled! Winners can claim.');
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
    },
    onError: (err) => alert('DB settle failed: ' + err.message),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="p-4 bg-card border border-border/50 rounded-xl"
    >
      {!isConnected && (
        <div className="mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-xs text-yellow-500 font-bold">⚠️ Wallet Not Connected</p>
          <p className="text-[10px] text-yellow-500/80 mt-1">Please connect your Phantom wallet to settle markets.</p>
        </div>
      )}
      {isConnected && !isCorrectAdmin && (
        <div className="mb-3 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <p className="text-xs text-destructive font-bold">⚠️ Wrong Wallet Connected</p>
          <p className="text-[10px] text-destructive/80 mt-1">
            Connected: <span className="font-mono">{walletAddress?.slice(0, 8)}...{walletAddress?.slice(-8)}</span>
          </p>
          <p className="text-[10px] text-destructive/80">
            Required: <span className="font-mono">{ADMIN_WALLET.slice(0, 8)}...{ADMIN_WALLET.slice(-8)}</span>
          </p>
          <p className="text-[10px] text-destructive/80 mt-2">Please disconnect and reconnect with the correct admin wallet.</p>
        </div>
      )}
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
          <div className="flex gap-2">
            {pendingRecreate ? (
              <div className="w-80">
                {pendingRecreate.steps ? (
                  // 2-step flow: use RecreateMarketButton component
                  <RecreateMarketButton
                    bet={bet}
                    match_id={bet.match_id}
                    onSuccess={() => {
                      setPendingRecreate(null);
                      handleRecreateSuccess();
                    }}
                  />
                ) : (
                  // Legacy single-step flow
                  <SolanaTransactionSigner
                    instruction={pendingRecreate}
                    amount={0}
                    onSuccess={handleRecreateSuccess}
                    onError={handleRecreateError}
                  />
                )}
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!isConnected) {
                    alert('Please connect your Phantom wallet first');
                    return;
                  }
                  if (confirm('⚡ Test Mode: This will recreate the market with proper timestamps for immediate settlement.\n\n2 steps:\n1. Create market on-chain\n2. Backdate timestamps\n\nContinue?')) {
                    recreateMarketMutation.mutate({ bet_id: bet.id, match_id: bet.match_id });
                  }
                }}
                disabled={recreateMarketMutation.isPending || !isConnected}
                className="h-8 text-xs border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 rounded-lg"
              >
                ⚡ Test Mode
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualRefresh}
              className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 rounded-lg"
            >
              🔄 Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDbSettle(v => !v)}
              className="h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-lg"
            >
              <Database className="w-3 h-3 mr-1" /> DB Override
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const [marketDebug, platformDebug] = await Promise.all([
                    base44.functions.invoke('debugMarketSettlement', { bet_id: bet.id, match_id: bet.match_id }),
                    base44.functions.invoke('debugPlatformAdmin', {}),
                  ]);
                  
                  const debugInfo = {
                    market: marketDebug.data,
                    platform: platformDebug.data,
                    your_wallet: walletAddress,
                    wallet_matches_admin: walletAddress === platformDebug.data?.admin,
                  };
                  
                  alert('Debug Info:\n\n' + JSON.stringify(debugInfo, null, 2));
                } catch (err) {
                  alert('Debug error: ' + err.message);
                }
              }}
              className="h-8 text-xs border-muted/30 text-muted-foreground hover:bg-muted/10 rounded-lg"
            >
              🔍 Debug
            </Button>
          </div>
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

      {showDbSettle && (
        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400 font-bold mb-2">⚠️ DB Override — skips on-chain tx, commits settlement directly to database</p>
          <div className="flex gap-2 items-center">
            <Select value={dbSettleOutcome} onValueChange={setDbSettleOutcome}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">{bet.outcome_a}</SelectItem>
                <SelectItem value="draw">Draw</SelectItem>
                <SelectItem value="b">{bet.outcome_b}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => {
                if (confirm(`Force settle DB as "${dbSettleOutcome}" winner? This skips on-chain verification.`)) {
                  dbSettleMutation.mutate(dbSettleOutcome);
                }
              }}
              disabled={dbSettleMutation.isPending}
              className="h-8 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg"
            >
              <Database className="w-3 h-3 mr-1" /> Force Settle DB
            </Button>
          </div>
        </div>
      )}

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
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Settle Market On-Chain — Select Winner:</p>
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