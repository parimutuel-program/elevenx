import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle, Zap, Loader, Globe, Rocket, RefreshCcw, TrendingUp, Wand2 } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function AdminFuturesPanel({ walletAddress }) {
  const queryClient = useQueryClient();
  const [pendingDeploy, setPendingDeploy] = useState(null);
  const [deployingMarketId, setDeployingMarketId] = useState(null);
  const [isBulkDeploying, setIsBulkDeploying] = useState(false);
  const [isFetchingOdds, setIsFetchingOdds] = useState(false);
  const [pendingBulkDeploy, setPendingBulkDeploy] = useState(null);
  const [fixingTimestampsId, setFixingTimestampsId] = useState(null);
  const [pendingTimestampFix, setPendingTimestampFix] = useState(null);
  const [oddsStatus, setOddsStatus] = useState(null);
  const [settlingWithOracle, setSettlingWithOracle] = useState(null);
  const [manualSettleModal, setManualSettleModal] = useState({ open: false, marketId: null, marketName: '' });

  // Fetch existing futures markets (country-by-country)
  const { data: futuresMarkets = [], refetch } = useQuery({
    queryKey: ['futuresMarkets'],
    queryFn: () => base44.entities.FuturesMarket.list('-created_date', 100),
  });

  // Step 1: Fetch odds from The Odds API (creates/updates markets)
  const handleFetchOdds = async () => {
    setIsFetchingOdds(true);
    setOddsStatus(null);
    try {
      const res = await base44.functions.invoke('fetchAndCalculateOdds', {});
      if (res.data.error) {
        setOddsStatus({ error: res.data.error });
        return;
      }
      setOddsStatus({ success: true, count: res.data.countriesProcessed });
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
    } catch (error) {
      setOddsStatus({ error: error.message });
    } finally {
      setIsFetchingOdds(false);
    }
  };

  // Step 2: Bulk deploy all markets
  const handleBulkDeploy = async () => {
    setIsBulkDeploying(true);
    try {
      const res = await base44.functions.invoke('bulkDeployFutures', {});
      if (res.data.error) {
        alert('Error: ' + res.data.error);
        return;
      }
      
      if (res.data.instructions && res.data.instructions.length > 0) {
        setPendingBulkDeploy({
          instructions: res.data.instructions,
          marketUpdates: res.data.marketUpdates,
          marketCount: res.data.marketCount,
          currentIndex: 0,
        });
      } else {
        alert('No markets to deploy or failed to prepare instructions');
      }
    } catch (error) {
      console.error('Bulk deploy failed:', error);
      alert('Failed to prepare bulk deploy: ' + error.message);
    } finally {
      setIsBulkDeploying(false);
    }
  };

  const handleBulkDeploySuccess = async (result) => {
    console.log('Market deployed:', result);
    
    // Update current market in DB
    const currentInstruction = pendingBulkDeploy?.instructions[pendingBulkDeploy.currentIndex];
    const currentUpdate = pendingBulkDeploy?.marketUpdates[pendingBulkDeploy.currentIndex];
    if (currentUpdate) {
      await base44.entities.FuturesMarket.update(currentUpdate.id, {
        solana_market_created: true,
        solana_market_pda: currentUpdate.solana_market_pda,
      });
    }

    const nextIndex = pendingBulkDeploy.currentIndex + 1;

    if (nextIndex < pendingBulkDeploy.instructions.length) {
      // Move to next market
      setPendingBulkDeploy(prev => ({ ...prev, currentIndex: nextIndex }));
    } else {
      // All done
      setPendingBulkDeploy(null);
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
      alert(`✓ Successfully deployed all ${pendingBulkDeploy.instructions.length} futures markets to Solana!`);
    }
  };

  const handleDeploySuccess = async (result) => {
    console.log('Futures market deploy success:', result);
    
    if (pendingDeploy?.futures_market_id) {
      // Now set solana_market_created: true AFTER successful on-chain confirmation
      await base44.entities.FuturesMarket.update(pendingDeploy.futures_market_id, {
        solana_market_created: true,
        solana_market_pda: pendingDeploy.marketPda || result.marketPda,
      });
    }
    
    setPendingDeploy(null);
    setDeployingMarketId(null);
    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
    alert('Country futures market deployed on-chain!');
  };

  const fixTimestampsMutation = useMutation({
    mutationFn: async (marketId) => {
      const res = await base44.functions.invoke('fixFuturesMarketTimestamps', {
        futures_market_id: marketId,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data, marketId) => {
      if (data.solana_instruction) {
        setPendingTimestampFix({
          ...data.solana_instruction,
          futures_market_id: marketId,
        });
      }
    },
  });

  const handleTimestampFixSuccess = async () => {
    setPendingTimestampFix(null);
    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
    alert('✓ Futures market timestamps fixed! You can now place bets and LP.');
  };

  const settleWithOracleMutation = useMutation({
    mutationFn: async ({ marketId, manual_winning_position }) => {
      // Step 1: Prepare on-chain settlement transaction
      const res = await base44.functions.invoke('settleFuturesMarketOnChain', {
        futures_market_id: marketId,
        winning_position: manual_winning_position,
        admin_wallet: walletAddress,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data, marketId) => {
      // Step 2: Show transaction signing modal
      setSettlingWithOracle({
        instruction: data.solana_instruction,
        futures_market_id: marketId,
        winning_position: data.winning_position,
      });
    },
    onError: (error) => {
      setSettlingWithOracle(null);
      alert('Settlement failed: ' + error.message);
    },
  });

  // Simple DB-only settlement (no on-chain - for testing)
  const manualSettleMutation = useMutation({
    mutationFn: async ({ marketId, winningPosition }) => {
      const res = await base44.functions.invoke('announceFuturesWinner', {
        futures_market_id: marketId,
        winning_position: winningPosition,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      alert('✓ Market settled (DB only)!');
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
      setManualSettleModal({ open: false, marketId: null, marketName: '' });
    },
    onError: (error) => {
      alert('Manual settle failed: ' + error.message);
    },
  });

  const handleSettlementSuccess = async (result) => {
    // Step 3: Commit settlement to database after on-chain confirmation
    try {
      const commitRes = await base44.functions.invoke('commitFuturesSettlement', {
        signature: result.signature,
        futures_market_id: settlingWithOracle.futures_market_id,
        winning_position: settlingWithOracle.winning_position,
      });
      
      setSettlingWithOracle(null);
      setManualSettleModal({ open: false, marketId: null, marketName: '' });
      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
      
      if (commitRes.data.error) {
        alert('Settlement transaction confirmed but commit failed: ' + commitRes.data.error);
        return;
      }
      
      alert(`✓ On-chain settlement complete!\n\n${commitRes.data.message}\nWinners: ${commitRes.data.winners_count} | Losers: ${commitRes.data.losers_count} | Refunds: ${commitRes.data.pending_refunds}`);
    } catch (error) {
      console.error('Commit failed:', error);
      alert('Transaction confirmed but database update failed: ' + error.message);
    }
  };

  const deployMutation = useMutation({
    mutationFn: async (marketId) => {
      const res = await base44.functions.invoke('createFuturesMarketOnChain', {
        futures_market_id: marketId,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data, marketId) => {
      console.log('[AdminFuturesPanel] Deploy response:', data);
      if (data.solana_instruction) {
        setPendingDeploy({
          ...data.solana_instruction,
          futures_market_id: marketId,
        });
      } else if (data.alreadyExists) {
        alert('Market already exists on-chain!');
        queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
      } else if (data.needsPlatformInit) {
        alert('⚠️ Platform not initialized! Please go to Platform tab and click "Init Platform" first.');
      } else {
        alert('Unexpected response: ' + JSON.stringify(data));
      }
    },
  });

  const deployedCount = futuresMarkets.filter(m => m.solana_market_created).length;
  const undeployedCount = futuresMarkets.filter(m => !m.solana_market_created).length;

  return (
    <div className="space-y-4">
      {/* Summary + Actions */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-bold text-foreground">Country Futures Markets</p>
              <p className="text-xs text-muted-foreground">
                {deployedCount} on-chain · {undeployedCount} pending · {futuresMarkets.length} total
              </p>
            </div>
          </div>
          <Badge className="bg-primary text-primary-foreground font-bold">
            {futuresMarkets.length} Markets
          </Badge>
        </div>

        {/* Odds Status Message */}
        {oddsStatus && (
          <div className={`text-xs rounded-lg px-3 py-2 ${oddsStatus.error ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-accent/10 text-accent border border-accent/20'}`}>
            {oddsStatus.error ? `⚠️ ${oddsStatus.error}` : `✓ Fetched odds for ${oddsStatus.count} countries from The Odds API`}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Step 1: Fetch Odds from API */}
          <Button
            size="sm"
            onClick={handleFetchOdds}
            disabled={isFetchingOdds}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-8 px-3 rounded-lg"
          >
            {isFetchingOdds ? (
              <><Loader className="w-3 h-3 animate-spin mr-1" /> Fetching...</>
            ) : (
              <><TrendingUp className="w-3 h-3 mr-1" /> 1. Fetch Odds API</>
            )}
          </Button>

          {/* Step 2: Deploy All to Solana */}
          <Button
            size="sm"
            onClick={handleBulkDeploy}
            disabled={isBulkDeploying || futuresMarkets.length === 0}
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold h-8 px-3 rounded-lg"
          >
            {isBulkDeploying ? (
              <><Loader className="w-3 h-3 animate-spin mr-1" /> Preparing...</>
            ) : (
              <><Rocket className="w-3 h-3 mr-1" /> 2. Deploy All ({undeployedCount})</>
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Step 1 fetches live odds from The Odds API and creates/updates all 48 country markets. Step 2 deploys them to Solana for on-chain betting.
        </p>
      </div>

      {/* Markets List */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {futuresMarkets.map((market, i) => (
          <div 
            key={market.id}
            className="bg-card border border-border/50 rounded-xl p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 flex items-center justify-center text-2xl">
                  {market.country_flag || market.icon || '🌍'}
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm">{market.country}</h3>
                  <p className="text-xs text-muted-foreground">{market.subtitle}</p>
                </div>
              </div>
              {market.solana_market_created ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-accent/20 text-accent text-xs py-1 px-3 rounded-lg">
                    <CheckCircle className="w-3 h-3 mr-1" /> On-Chain
                  </Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      console.log('[AdminFutures] Settle clicked:', { marketId: market.id, status: market.status, country: market.country });
                      setManualSettleModal({ open: true, marketId: market.id, marketName: market.country });
                    }}
                    disabled={
                      market.status === 'settled' || 
                      settlingWithOracle === market.id || 
                      settleWithOracleMutation.isPending
                    }
                    className={`${
                      market.status === 'settled' || settlingWithOracle === market.id || settleWithOracleMutation.isPending
                        ? 'bg-muted/30 text-muted-foreground cursor-not-allowed border border-muted/50'
                        : 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20'
                    } text-xs font-bold h-7 px-2 rounded-lg`}
                    title={market.status === 'settled' ? 'Already settled' : 'Settle market (admin override)'}
                  >
                    {settlingWithOracle === market.id || settleWithOracleMutation.isPending ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3 mr-1" /> Settle (Oracle)
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFixingTimestampsId(market.id);
                      fixTimestampsMutation.mutate(market.id);
                    }}
                    disabled={fixTimestampsMutation.isPending || fixingTimestampsId === market.id}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold h-7 px-2 rounded-lg"
                  >
                    {fixingTimestampsId === market.id && fixTimestampsMutation.isPending ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <RefreshCcw className="w-3 h-3 mr-1" /> Fix Timestamps
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge className="bg-secondary text-secondary-foreground text-xs py-1 px-3 rounded-lg">
                    Not Deployed
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDeployingMarketId(market.id);
                      deployMutation.mutate(market.id);
                    }}
                    disabled={deployMutation.isPending || deployingMarketId === market.id}
                    className="bg-primary hover:bg-primary/90 text-xs font-bold h-7 px-2 rounded-lg"
                  >
                    {deployingMarketId === market.id && deployMutation.isPending ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Rocket className="w-3 h-3 mr-1" /> Deploy
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Outcomes */}
            <div className="bg-secondary/30 rounded-lg p-3 mt-3">
              <div className="grid grid-cols-3 gap-2">
                {market.outcomes?.map((outcome, idx) => (
                  <div key={idx} className="text-center">
                    <p className="text-[10px] text-muted-foreground">{outcome.position}</p>
                    <p className="font-bold text-xs text-primary">{outcome.odds.toFixed(2)}x</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {futuresMarkets.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-primary mx-auto mb-4" />
          <h3 className="font-heading font-bold text-lg mb-2">No Country Markets Yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Use "Fetch All Odds" to create markets automatically from API data
          </p>
        </div>
      )}

      {/* Single Deploy Transaction Modal */}
      {pendingDeploy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">Deploy to Solana</p>
                <p className="text-xs text-muted-foreground">Sign transaction to deploy this country market on-chain</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingDeploy}
                amount={0}
                futures_market_id={pendingDeploy.futures_market_id}
                onSuccess={handleDeploySuccess}
              />
              <Button variant="outline" size="sm" onClick={() => setPendingDeploy(null)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fix Timestamps Modal */}
      {pendingTimestampFix && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
            <div className="space-y-4">
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <p className="text-sm font-bold text-accent mb-1">Fix Market Timestamps</p>
                <p className="text-xs text-muted-foreground">Set open_until to 30 days from now (for testing)</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingTimestampFix}
                amount={0}
                futures_market_id={pendingTimestampFix.futures_market_id}
                onSuccess={handleTimestampFixSuccess}
              />
              <Button variant="outline" size="sm" onClick={() => setPendingTimestampFix(null)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Deploy Transaction Modal - signs one market at a time */}
      {pendingBulkDeploy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-lg w-full">
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">
                  Deploy Market {pendingBulkDeploy.currentIndex + 1} of {pendingBulkDeploy.instructions.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sign each transaction to deploy markets one at a time. Remaining: {pendingBulkDeploy.instructions.length - pendingBulkDeploy.currentIndex}
                </p>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${(pendingBulkDeploy.currentIndex / pendingBulkDeploy.instructions.length) * 100}%` }}
                />
              </div>

              <SolanaTransactionSigner
                instruction={pendingBulkDeploy.instructions[pendingBulkDeploy.currentIndex]}
                amount={0}
                onSuccess={handleBulkDeploySuccess}
              />
              <Button variant="outline" size="sm" onClick={() => setPendingBulkDeploy(null)} className="w-full">
                Cancel (Deployed {pendingBulkDeploy.currentIndex} so far)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Settlement Modal - Position Selection */}
      {manualSettleModal.open && !settlingWithOracle && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
            <div className="space-y-4">
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <p className="text-sm font-bold text-accent mb-1">Settle Futures Market</p>
                <p className="text-xs text-muted-foreground">Select the winning position for {manualSettleModal.marketName}</p>
              </div>
              
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center">Choose settlement method:</p>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => settleWithOracleMutation.mutate({ 
                      marketId: manualSettleModal.marketId, 
                      manual_winning_position: '1st' 
                    })}
                    disabled={settleWithOracleMutation.isPending}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold h-10 rounded-xl"
                  >
                    1st (On-Chain)
                  </Button>
                  <Button
                    onClick={() => manualSettleMutation.mutate({ 
                      marketId: manualSettleModal.marketId, 
                      winningPosition: '1st' 
                    })}
                    disabled={manualSettleMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold h-10 rounded-xl"
                  >
                    1st (DB Only)
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => settleWithOracleMutation.mutate({ 
                      marketId: manualSettleModal.marketId, 
                      manual_winning_position: '2nd' 
                    })}
                    disabled={settleWithOracleMutation.isPending}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold h-10 rounded-xl"
                  >
                    2nd (On-Chain)
                  </Button>
                  <Button
                    onClick={() => manualSettleMutation.mutate({ 
                      marketId: manualSettleModal.marketId, 
                      winningPosition: '2nd' 
                    })}
                    disabled={manualSettleMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold h-10 rounded-xl"
                  >
                    2nd (DB Only)
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => settleWithOracleMutation.mutate({ 
                      marketId: manualSettleModal.marketId, 
                      manual_winning_position: '3rd' 
                    })}
                    disabled={settleWithOracleMutation.isPending}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold h-10 rounded-xl"
                  >
                    3rd (On-Chain)
                  </Button>
                  <Button
                    onClick={() => manualSettleMutation.mutate({ 
                      marketId: manualSettleModal.marketId, 
                      winningPosition: '3rd' 
                    })}
                    disabled={manualSettleMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold h-10 rounded-xl"
                  >
                    3rd (DB Only)
                  </Button>
                </div>
              </div>
              
              <p className="text-[10px] text-muted-foreground text-center pt-2">
                Use "DB Only" for testing (skips on-chain transaction)
              </p>
              
              <Button variant="outline" size="sm" onClick={() => setManualSettleModal({ open: false, marketId: null, marketName: '' })} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* On-Chain Settlement Transaction Modal */}
      {settlingWithOracle && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-lg w-full">
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">On-Chain Settlement</p>
                <p className="text-xs text-muted-foreground">
                  Sign transaction to settle {manualSettleModal.marketName} on Solana
                  {settlingWithOracle.winning_position && ` — Winner: ${settlingWithOracle.winning_position} place`}
                </p>
              </div>
              
              <SolanaTransactionSigner
                instruction={settlingWithOracle.instruction}
                amount={0}
                futures_market_id={settlingWithOracle.futures_market_id}
                onSuccess={handleSettlementSuccess}
                onError={(err) => {
                  console.error('Settlement transaction failed:', err);
                  setSettlingWithOracle(null);
                }}
              />
              
              <Button variant="outline" size="sm" onClick={() => setSettlingWithOracle(null)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}