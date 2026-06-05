import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminBetRow from '@/components/admin/AdminBetRow';
import AdminFuturesPanel from '@/components/admin/AdminFuturesPanel';
import AdminMatchesPanel from '@/components/admin/AdminMatchesPanel';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { AlertCircle, Loader, List, TrendingUp, Database, Settings, Trophy } from 'lucide-react';

export default function Admin() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [activeTab, setActiveTab] = useState('matches');
  const [settleDialog, setSettleDialog] = useState(null); // { instruction, bet, outcome }
  const [voidDialog, setVoidDialog] = useState(null);
  // Two-step settle: first fix timestamps, then settle
  const [fixTimestampDialog, setFixTimestampDialog] = useState(null); // { instruction, pendingSettle: { bet, outcome } }
  const queryClient = useQueryClient();

  useEffect(() => {
    const stored = localStorage.getItem('elevenx_wallet_session');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setWalletAddress(data.address);
      } catch (e) {
        console.error('[Admin] Failed to parse wallet:', e);
      }
    }
  }, []);

  const { data: allBets = [], isLoading: isLoadingBets } = useQuery({
    queryKey: ['allBets'],
    queryFn: async () => {
      const bets = await base44.entities.Bet.list();
      return bets;
    },
  });

  const { data: allMatches = {} } = useQuery({
    queryKey: ['allMatches'],
    queryFn: async () => {
      const matches = await base44.entities.Match.list();
      const matchMap = {};
      matches.forEach(m => {
        matchMap[m.id] = m;
      });
      return matchMap;
    },
  });

  const handleSettle = async (bet, outcome) => {
    if (!walletAddress) return;
    
    // Skip timestamp fix - just settle directly (program allows admin override)
    await _doSettle(bet, outcome);
  };

  const _doSettle = async (bet, outcome) => {
    try {
      const res = await base44.functions.invoke('settleMarketOnChain', {
        bet_id: bet.id,
        winning_outcome: outcome,
        admin_wallet: walletAddress,
      });

      if (res.data.error) {
        alert('Error: ' + res.data.error);
        return;
      }

      if (res.data.db_only) {
        // DB-only settlement - update DB directly
        try {
          await base44.functions.invoke('commitSettlement', {
            bet_id: bet.id,
            winning_outcome: outcome,
            db_only: true,
          });
          alert('✓ Market settled (DB-only) — users can now claim winnings!\n\n' + res.data.message);
        } catch (err) {
          alert('DB settlement failed: ' + err.message);
        }
        queryClient.invalidateQueries({ queryKey: ['allBets'] });
        return;
      }

      setSettleDialog({
        instruction: res.data.solana_instruction,
        bet,
        outcome,
      });
    } catch (err) {
      alert('Failed to prepare settlement: ' + err.message);
    }
  };

  const handleTimestampFixSuccess = async () => {
    const pending = fixTimestampDialog?.pendingSettle;
    setFixTimestampDialog(null);
    if (pending) {
      await _doSettle(pending.bet, pending.outcome);
    }
  };

  const handleVoid = async (bet) => {
    if (!walletAddress) return;
    try {
      const res = await base44.functions.invoke('settleMarketOnChain', {
        bet_id: bet.id,
        winning_outcome: 'void',
        admin_wallet: walletAddress,
      });

      if (res.data.error) {
        alert('Error: ' + res.data.error);
        return;
      }

      setVoidDialog({
        instruction: res.data.solana_instruction,
        bet,
      });
    } catch (err) {
      alert('Failed to prepare void: ' + err.message);
    }
  };

  const handleSettleSuccess = async (commitPayload) => {
    // Call commitSettlement to update DB after on-chain tx confirms
    if (commitPayload?.signature && settleDialog?.bet) {
      try {
        await base44.functions.invoke('commitSettlement', {
          signature: commitPayload.signature,
          bet_id: settleDialog.bet.id,
          winning_outcome: settleDialog.outcome,
        });
      } catch (err) {
        console.error('[Admin] commitSettlement failed:', err);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['allBets'] });
    setSettleDialog(null);
  };

  const handleVoidSuccess = async (commitPayload) => {
    // Call commitSettlement to update DB after on-chain tx confirms
    if (commitPayload?.signature && voidDialog?.bet) {
      try {
        await base44.functions.invoke('commitSettlement', {
          signature: commitPayload.signature,
          bet_id: voidDialog.bet.id,
          winning_outcome: 'void',
        });
      } catch (err) {
        console.error('[Admin] commitSettlement failed:', err);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['allBets'] });
    setVoidDialog(null);
  };

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading font-bold text-3xl text-white mb-2">Admin Dashboard</h1>
          <p className="text-sm text-gray-400">Manage betting markets and settlements</p>
        </div>

        <Card className="bg-gray-900 border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Connected Wallet</p>
              <p className="font-mono text-sm text-white">{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}` : 'Not connected'}</p>
            </div>
            <Badge variant={walletAddress ? 'default' : 'outline'}>
              {walletAddress ? '✓ Connected' : '✗ Disconnected'}
            </Badge>
          </div>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-gray-900 border border-gray-800 rounded-xl p-1">
            <TabsTrigger value="matches" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg">
              <Trophy className="w-4 h-4 mr-2" />
              Matches
            </TabsTrigger>
            <TabsTrigger value="bets" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg">
              <List className="w-4 h-4 mr-2" />
              Bets
            </TabsTrigger>
            <TabsTrigger value="futures" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg">
              <TrendingUp className="w-4 h-4 mr-2" />
              Futures
            </TabsTrigger>
            <TabsTrigger value="actions" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg">
              <Database className="w-4 h-4 mr-2" />
              Actions
            </TabsTrigger>
            <TabsTrigger value="platform" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white rounded-lg">
              <Settings className="w-4 h-4 mr-2" />
              Platform
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-4">
            <AdminMatchesPanel walletAddress={walletAddress} />
          </TabsContent>

          <TabsContent value="bets" className="mt-4">
            <Card className="bg-gray-900 border border-gray-800 p-4">
              <h2 className="font-heading font-bold text-xl text-white mb-4">Betting Markets ({allBets.length})</h2>
              
              {isLoadingBets ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-6 h-6 animate-spin text-purple-500 mr-2" />
                  <span className="text-gray-400">Loading bets...</span>
                </div>
              ) : allBets.length === 0 ? (
                <div className="flex items-center gap-3 py-6">
                  <AlertCircle className="w-5 h-5 text-gray-500" />
                  <p className="text-gray-400">No bets found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allBets.map((bet) => (
                    <div key={bet.id} className="border border-gray-800 rounded-lg p-3">
                      <AdminBetRow
                        bet={bet}
                        match={allMatches[bet.match_id]}
                        onSettle={handleSettle}
                        onVoid={handleVoid}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="futures" className="mt-4">
            <AdminFuturesPanel walletAddress={walletAddress} />
          </TabsContent>

          <TabsContent value="actions" className="mt-4">
            <Card className="bg-gray-900 border border-gray-800 p-6">
              <h2 className="font-heading font-bold text-xl text-white mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('createQuickTestMatch');
                      alert('✓ Test match created!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">⚡ Create Quick Test</span>
                  <span className="text-xs text-gray-400">Instant match + bet</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('createQuickTestFutures');
                      alert('✓ Future Test created! Betting ends in 30 min, no settlement delay!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🚀 Future Test</span>
                  <span className="text-xs text-gray-400">30 min betting, instant settle</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('bulkDeployMatches');
                      alert('✓ Matches deployed!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🚀 Bulk Deploy</span>
                  <span className="text-xs text-gray-400">All matches</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('syncWorldCupMatches');
                      alert('✓ World Cup synced!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-600/50 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🌍 Sync World Cup</span>
                  <span className="text-xs text-gray-400">Fetch from API</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('bulkDeployFutures');
                      alert('✓ Futures deployed!');
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-600/50 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">📊 Deploy Futures</span>
                  <span className="text-xs text-gray-400">All countries</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('createTestBetWithLiveOdds');
                      alert('✓ Test bet with live odds created!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">📈 Live Odds Bet</span>
                  <span className="text-xs text-gray-400">Real API odds</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('createTestBetWithApiMatch');
                      alert('✓ API match bet created!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🎯 API Match</span>
                  <span className="text-xs text-gray-400">Real match data</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('resetAndSync');
                      alert('✓ Database reset & synced!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🔄 Reset & Sync</span>
                  <span className="text-xs text-gray-400">Clear all data</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('clearDatabase');
                      alert('✓ Database cleared!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🗑️ Clear DB</span>
                  <span className="text-xs text-gray-400">Delete everything</span>
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="platform" className="mt-4">
            <Card className="bg-gray-900 border border-gray-800 p-6">
              <h2 className="font-heading font-bold text-xl text-white mb-4">Platform Settings</h2>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('initPlatformConfig');
                      alert('✓ Platform initialized!');
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl"
                >
                  Init Platform
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('checkPlatformConfig');
                      alert('✓ Config checked!');
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl"
                >
                  Check Config
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('debugPlatformAdmin');
                      alert('✓ Debug complete!');
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl"
                >
                  Debug Admin
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('comprehensivePlatformTest');
                      alert('✓ Test complete!');
                    } catch (err) {
                      alert('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl"
                >
                  Full Test
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {fixTimestampDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-yellow-600/20 border border-yellow-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-yellow-400 mb-1">Step 1/2: Fix Market Timestamps</h3>
                  <p className="text-sm text-gray-400">The on-chain market has a corrupted <code>settle_after</code> timestamp. This tx fixes it so settlement can proceed on-chain and users receive real SOL payouts.</p>
                </div>
                <SolanaTransactionSigner
                  instruction={fixTimestampDialog.instruction}
                  amount={0}
                  onSuccess={handleTimestampFixSuccess}
                  onError={(err) => { console.error('[Admin] Timestamp fix failed:', err); setFixTimestampDialog(null); }}
                />
                <Button onClick={() => setFixTimestampDialog(null)} variant="outline" className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700">
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}

        {settleDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-purple-600/20 border border-purple-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-purple-400 mb-1">Settle Market</h3>
                  <p className="text-sm text-gray-400">Outcome: <span className="text-white font-bold">{settleDialog.outcome.toUpperCase()}</span></p>
                </div>
                <SolanaTransactionSigner
                  instruction={settleDialog.instruction}
                  amount={0}
                  onSuccess={handleSettleSuccess}
                  onError={(err) => console.error('[Admin] Settlement failed:', err)}
                />
                <Button
                  onClick={() => setSettleDialog(null)}
                  variant="outline"
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}

        {voidDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-red-600/20 border border-red-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-red-400 mb-1">Void Market</h3>
                  <p className="text-sm text-gray-400">This will refund all bettors</p>
                </div>
                <SolanaTransactionSigner
                  instruction={voidDialog.instruction}
                  amount={0}
                  onSuccess={handleVoidSuccess}
                  onError={(err) => console.error('[Admin] Void failed:', err)}
                />
                <Button
                  onClick={() => setVoidDialog(null)}
                  variant="outline"
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}