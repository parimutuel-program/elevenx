import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle, Zap, Loader, Globe, Rocket } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function AdminFuturesPanel() {
  const queryClient = useQueryClient();
  const [pendingDeploy, setPendingDeploy] = useState(null);
  const [deployingMarketId, setDeployingMarketId] = useState(null);
  const [isBulkDeploying, setIsBulkDeploying] = useState(false);
  const [pendingBulkDeploy, setPendingBulkDeploy] = useState(null);

  // Fetch existing futures markets (country-by-country)
  const { data: futuresMarkets = [], refetch } = useQuery({
    queryKey: ['futuresMarkets'],
    queryFn: () => base44.entities.FuturesMarket.list('-created_date', 100),
  });

  // Bulk deploy all markets
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
    console.log('Bulk deploy success:', result);
    
    // Update all deployed markets in database
    if (pendingBulkDeploy?.marketUpdates) {
      for (const marketUpdate of pendingBulkDeploy.marketUpdates) {
        await base44.entities.FuturesMarket.update(marketUpdate.id, {
          solana_market_created: true,
          solana_market_pda: marketUpdate.solana_market_pda,
        });
      }
    }
    
    setPendingBulkDeploy(null);
    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
    alert(`✓ Successfully deployed ${pendingBulkDeploy?.marketCount || 0} futures markets to Solana!`);
  };

  const handleDeploySuccess = async (result) => {
    console.log('Futures market deploy success:', result);
    
    if (pendingDeploy?.futures_market_id) {
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

  const deployMutation = useMutation({
    mutationFn: async (marketId) => {
      const res = await base44.functions.invoke('createFuturesMarketOnChain', {
        futures_market_id: marketId,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data, marketId) => {
      if (data.solana_instruction) {
        setPendingDeploy(data.solana_instruction);
      } else if (data.alreadyExists) {
        alert('Market already exists on-chain!');
        queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
      }
    },
  });

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">Country Futures Markets</p>
            <p className="text-xs text-muted-foreground">Each country has 1st, 2nd, 3rd place outcomes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary text-primary-foreground font-bold">
            {futuresMarkets.length} Markets
          </Badge>
          <Button
            size="sm"
            onClick={handleBulkDeploy}
            disabled={isBulkDeploying || futuresMarkets.length === 0}
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold h-8 px-3 rounded-lg"
          >
            {isBulkDeploying ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Rocket className="w-3 h-3 mr-1" /> Deploy All
              </>
            )}
          </Button>
        </div>
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
                <Badge className="bg-accent/20 text-accent text-xs py-1 px-3 rounded-lg">
                  <CheckCircle className="w-3 h-3 mr-1" /> On-Chain
                </Badge>
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

      {/* Bulk Deploy Transaction Modal */}
      {pendingBulkDeploy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-lg w-full">
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">Bulk Deploy {pendingBulkDeploy.marketCount} Markets</p>
                <p className="text-xs text-muted-foreground">
                  This will deploy all {pendingBulkDeploy.marketCount} country futures markets to Solana in a single transaction.
                </p>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2">
                <p className="text-xs font-bold text-foreground mb-2">Markets to deploy:</p>
                {pendingBulkDeploy.instructions.map((inst, idx) => (
                  <div key={idx} className="bg-secondary/30 rounded-lg p-2 flex items-center justify-between">
                    <span className="text-xs font-bold">{inst.marketId?.slice(0, 8)}...{inst.marketId?.slice(-4)}</span>
                    <Badge className="text-[9px] bg-primary/20 text-primary">Market #{idx + 1}</Badge>
                  </div>
                ))}
              </div>

              <SolanaTransactionSigner
                instruction={pendingBulkDeploy.instructions[0]}
                amount={0}
                futures_market_id={pendingBulkDeploy.instructions[0]?.futures_market_id}
                onSuccess={handleBulkDeploySuccess}
              />
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPendingBulkDeploy(null)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    // For bulk deploy, we'd need to batch multiple transactions
                    // For now, deploy first market as demo
                    alert('Note: Full bulk transaction support requires Solana transaction batching. Deploying markets one at a time is recommended for now.');
                  }}
                  className="flex-1 bg-accent hover:bg-accent/90"
                  disabled
                >
                  Batch Deploy (Coming Soon)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}