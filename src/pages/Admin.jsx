import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminBetRow from '@/components/admin/AdminBetRow';
import AdminFuturesPanel from '@/components/admin/AdminFuturesPanel';
import AdminMatchesPanel from '@/components/admin/AdminMatchesPanel';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { AlertCircle, Loader, List, TrendingUp, Database, Settings, Trophy, Wallet } from 'lucide-react';

export default function Admin() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [activeTab, setActiveTab] = useState('matches');
  const [settleDialog, setSettleDialog] = useState(null); // { instruction, bet, outcome }
  const [voidDialog, setVoidDialog] = useState(null);
  // Two-step settle: first fix timestamps, then settle
  const [fixTimestampDialog, setFixTimestampDialog] = useState(null); // { instruction, pendingSettle: { bet, outcome } }
  const [initPlatformDialog, setInitPlatformDialog] = useState(null); // { instruction }
  const [deployFuturesDialog, setDeployFuturesDialog] = useState(null); // { instruction, remaining, marketId }
  const [deployMatchesDialog, setDeployMatchesDialog] = useState(null); // { instruction, remaining, betId }
  const [withdrawFeesDialog, setWithdrawFeesDialog] = useState(null); // { instruction, amountSOL }
  const [sweepDialog, setSweepDialog] = useState(null); // { instruction, marketPda, balance }
  const [loadingActions, setLoadingActions] = useState({
    registerAdmin: false,
    initPlatform: false,
    checkConfig: false,
    debugAdmin: false,
    checkFeeVault: false,
    withdrawFees: false,
  }); // Track which buttons are loading
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

  const { data: allBets = [], isLoading: isLoadingBets, refetch } = useQuery({
    queryKey: ['allBets'],
    queryFn: async () => {
      const bets = await base44.entities.Bet.list();
      console.log('[Admin] Fetched bets:', bets.map(b => b.id));
      return bets;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
    
    try {
      console.log('[Admin] Calling settleMarketOnChain for bet:', bet.id, 'outcome:', outcome, 'wallet:', walletAddress);
      const res = await base44.functions.invoke('settleMarketOnChain', {
        bet_id: bet.id,
        winning_outcome: outcome,
        admin_wallet: walletAddress,
      });
      console.log('[Admin] settleMarketOnChain response:', res.data);

      if (res.data.error) {
        console.error('[Admin] Backend error:', res.data);
        toast.error('Error: ' + res.data.error);
        return;
      }

      // Always do 2-step: fix timestamps first, then settle
      if (res.data.timestamp_instruction) {
        setFixTimestampDialog({
          instruction: res.data.timestamp_instruction,
          pendingSettle: { bet, outcome, settleInstruction: res.data.solana_instruction },
        });
      } else {
        setSettleDialog({
          instruction: res.data.solana_instruction,
          bet,
          outcome,
        });
      }
    } catch (err) {
      console.error('[Admin] handleSettle error:', err);
      toast.error('Failed to prepare settlement: ' + (err.message || 'Unknown error'));
    }
  };

  const _doSettle = async (bet, outcome) => {
    try {
      const res = await base44.functions.invoke('settleMarketOnChain', {
        bet_id: bet.id,
        winning_outcome: outcome,
        admin_wallet: walletAddress,
      });

      if (res.data.error) {
        toast.error('Error: ' + res.data.error);
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
          toast.success('✓ Market settled (DB-only) — users can now claim winnings!');
        } catch (err) {
          toast.error('DB settlement failed: ' + err.message);
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
      console.error('[Admin] _doSettle error:', err);
      const errorMsg = err.message || 'Unknown error';
      toast.error('Failed to prepare settlement: ' + errorMsg);
    }
  };

  const handleTimestampFixSuccess = async () => {
    const pending = fixTimestampDialog?.pendingSettle;
    setFixTimestampDialog(null);
    if (pending) {
      // Use the already-fetched settle instruction (no second API call)
      if (pending.settleInstruction) {
        setSettleDialog({
          instruction: pending.settleInstruction,
          bet: pending.bet,
          outcome: pending.outcome,
        });
      } else {
        await _doSettle(pending.bet, pending.outcome);
      }
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
        toast.error('Error: ' + res.data.error);
        return;
      }

      setVoidDialog({
        instruction: res.data.solana_instruction,
        bet,
      });
    } catch (err) {
      toast.error('Failed to prepare void: ' + err.message);
    }
  };

  const handleSettleSuccess = async (commitPayload) => {
    // Call commitSettlement to update DB after on-chain tx confirms
    if (commitPayload?.signature && settleDialog?.bet) {
      try {
        await base44.functions.invoke('commitSettlement', {
          signature: commitPayload.signature,
          commit_data: {
            bet_id: settleDialog.bet.id,
            match_id: settleDialog.bet.match_id,
            winning_outcome: settleDialog.outcome,
            outcome_label: settleDialog.outcome === 'a' ? settleDialog.bet.outcome_a : settleDialog.outcome === 'b' ? settleDialog.bet.outcome_b : 'Draw',
          },
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

  const handleInitPlatformSuccess = async () => {
    toast.success('✓ Platform initialized on Solana!');
    setInitPlatformDialog(null);
    queryClient.invalidateQueries({ queryKey: ['platformConfig'] });
  };

  const handleWithdrawFeesSuccess = async () => {
    toast.success('✓ Fees withdrawn to admin wallet!');
    setWithdrawFeesDialog(null);
    queryClient.invalidateQueries({ queryKey: ['platformConfig'] });
  };

  const handleSweepSuccess = async () => {
    toast.success('✓ Market funds swept to admin wallet!');
    setSweepDialog(null);
  };

  const handleDeployFuturesSuccess = async () => {
    // After signing, call deployAllFutures again to get next market
    try {
      const res = await base44.functions.invoke('deployAllFutures');
      if (res.data.needsSigning) {
        // More markets to deploy
        setDeployFuturesDialog({
          instruction: res.data.solana_instruction,
          remaining: res.data.remaining,
          marketId: res.data.market_id,
        });
      } else if (res.data.autoContinue) {
        // Market already exists, continue to next
        handleDeployFuturesSuccess(); // Recursively call to get next
      } else {
        // All done
        setDeployFuturesDialog(null);
        toast.success(res.data.message || '✓ All futures deployed!');
        queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
      setDeployFuturesDialog(null);
    }
  };

  const handleDeployMatchesSuccess = async () => {
    // After signing, call deployAllMatches again to get next match
    try {
      const res = await base44.functions.invoke('deployAllMatches');
      if (res.data.needsSigning) {
        // More matches to deploy
        setDeployMatchesDialog({
          instruction: res.data.solana_instruction,
          remaining: res.data.remaining,
          betId: res.data.bet_id,
        });
      } else if (res.data.autoContinue) {
        // Market already exists, continue to next
        handleDeployMatchesSuccess(); // Recursively call to get next
      } else {
        // All done
        setDeployMatchesDialog(null);
        toast.success(res.data.message || '✓ All matches deployed!');
        queryClient.invalidateQueries({ queryKey: ['allBets'] });
      }
    } catch (err) {
      toast.error('Error: ' + err.message);
      setDeployMatchesDialog(null);
    }
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
            <div className="flex items-center gap-2">
              <Badge variant={walletAddress ? 'default' : 'outline'}>
                {walletAddress ? '✓ Connected' : '✗ Disconnected'}
              </Badge>
              <Button
                onClick={() => refetch()}
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 text-white"
              >
                🔄 Refresh
              </Button>
            </div>
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
                      const res = await base44.functions.invoke('deployAllFutures');
                      if (res.data.needsSigning) {
                        setDeployFuturesDialog({
                          instruction: res.data.solana_instruction,
                          remaining: res.data.remaining,
                          marketId: res.data.market_id,
                        });
                      } else if (res.data.autoContinue) {
                        // Auto-continue if market already exists
                        toast.success('Continuing deployment...');
                        setTimeout(() => handleDeployFuturesSuccess(), 500);
                      } else {
                        toast.success(res.data.message || '✓ All futures deployed!');
                        queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
                      }
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🚀 Deploy All Futures</span>
                  <span className="text-xs text-gray-400">Deploy all futures markets</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await base44.functions.invoke('deployAllMatches');
                      if (res.data.needsSigning) {
                        setDeployMatchesDialog({
                          instruction: res.data.solana_instruction,
                          remaining: res.data.remaining,
                          betId: res.data.bet_id,
                        });
                      } else if (res.data.autoContinue) {
                        // Auto-continue if market already exists
                        toast.success('Continuing deployment...');
                        setTimeout(() => handleDeployMatchesSuccess(), 500);
                      } else {
                        toast.success(res.data.message || '✓ All matches deployed!');
                        queryClient.invalidateQueries({ queryKey: ['allBets'] });
                      }
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">⚡ Deploy All Matches</span>
                  <span className="text-xs text-gray-400">Deploy all match markets</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await base44.functions.invoke('deployAllFutures');
                      toast.success(res.data.message || '✓ All futures deployed!');
                      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🎯 Initialize Futures</span>
                  <span className="text-xs text-gray-400">Create on-chain markets</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await base44.functions.invoke('deployAllMatches');
                      toast.success(res.data.message || '✓ All matches deployed!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🏆 Initialize Matches</span>
                  <span className="text-xs text-gray-400">Create on-chain markets</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await base44.functions.invoke('createTestBetWithLiveOdds');
                      toast.success('✓ Test bet with live odds created!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
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
                      toast.success('✓ API match bet created!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
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
                      toast.success('✓ Database reset & synced!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
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
                      toast.success('✓ Database cleared!');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🗑️ Clear DB</span>
                  <span className="text-xs text-gray-400">Delete everything</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await base44.functions.invoke('createQuickTestMatch');
                      toast.success('✓ Quick test match created! Expires in 5 minutes.');
                      queryClient.invalidateQueries({ queryKey: ['allBets'] });
                      console.log('[Admin] Test match created:', res.data);
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">⏱️ Quick Test</span>
                  <span className="text-xs text-gray-400">5min expiry match</span>
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await base44.functions.invoke('fixLpSync');
                      console.log('[Admin] fixLpSync result:', res.data);
                      toast.success(`✓ Fixed ${res.data.updated || 0} LP positions! Refresh the LP page.`);
                      queryClient.invalidateQueries({ queryKey: ['lpPositions'] });
                    } catch (err) {
                      console.error('[Admin] fixLpSync error:', err);
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-24 flex flex-col gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded-xl"
                >
                  <span className="font-bold text-lg text-white">🔧 Fix LP Sync</span>
                  <span className="text-xs text-gray-400">Fix progress bars</span>
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
                    if (!walletAddress) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    if (loadingActions.registerAdmin) return;
                    setLoadingActions(prev => ({ ...prev, registerAdmin: true }));
                    try {
                      const res = await base44.functions.invoke('registerAdminWallet', { walletAddress });
                      toast.success(res.data.message || '✓ Wallet registered as admin!');
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    } finally {
                      setLoadingActions(prev => ({ ...prev, registerAdmin: false }));
                    }
                  }}
                  disabled={loadingActions.registerAdmin}
                  className="h-16 bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 text-white rounded-xl disabled:opacity-50"
                >
                  {loadingActions.registerAdmin ? 'Registering...' : 'Register Admin Wallet'}
                </Button>
                <Button
                  onClick={async () => {
                    if (!walletAddress) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    if (loadingActions.initPlatform) return;
                    setLoadingActions(prev => ({ ...prev, initPlatform: true }));
                    try {
                      // Use forceReinitPlatform which handles both fresh init and re-init correctly
                      const res = await base44.functions.invoke('forceReinitPlatform', { walletAddress });
                      console.log('[Admin] forceReinitPlatform response:', res.data);
                      if (res.data.alreadyInitialized) {
                        toast.success('✓ Platform already initialized!');
                        alert(`Platform Config Status\n\n✓ Already Initialized\n\nNo transaction needed!\n\nCurrent Admin: ${res.data.currentAdmin}\n\nPlatform PDA: ${res.data.platformPda}\nFee Vault PDA: ${res.data.feeVaultPda}`);
                        queryClient.invalidateQueries({ queryKey: ['platformConfig'] });
                    } else {
                        setInitPlatformDialog({ instruction: res.data.solana_instruction });
                    }
                    } catch (err) {
                      console.error('[Admin] forceReinitPlatform error:', err);
                      toast.error('Error: ' + err.message);
                    } finally {
                      setLoadingActions(prev => ({ ...prev, initPlatform: false }));
                    }
                  }}
                  disabled={loadingActions.initPlatform}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl disabled:opacity-50"
                >
                  {loadingActions.initPlatform ? 'Initializing...' : 'Init Platform'}
                </Button>
                <Button
                  onClick={async () => {
                    console.log('[Admin] Check Config button clicked');
                    if (loadingActions.checkConfig) {
                      console.log('[Admin] Already loading, returning');
                      return;
                    }
                    setLoadingActions(prev => ({ ...prev, checkConfig: true }));
                    console.log('[Admin] Calling checkPlatformConfig...');
                    try {
                      const res = await base44.functions.invoke('checkPlatformConfig');
                      console.log('[Admin] checkPlatformConfig response:', res.data);
                      if (res.data.error) {
                        toast.error('Error: ' + res.data.error);
                      } else if (res.data.initialized) {
                        toast.success(`✓ Platform initialized! Admin: ${res.data.admin?.slice(0, 8)}...`);
                        alert(`Platform Config Status\n\n✓ Initialized\n\nAdmin: ${res.data.admin}\nFee: ${res.data.feePercent}%\nConsensus: ${res.data.consensusThreshold}%\n\nPDA: ${res.data.platformConfigPda}`);
                      } else {
                        toast.error('Platform not initialized yet');
                        alert(`Platform Config Status\n\n✗ Not Initialized\n\n${res.data.message || 'Platform config account does not exist'}\n\nPDA: ${res.data.platformConfigPda}`);
                      }
                    } catch (err) {
                      console.error('[Admin] checkPlatformConfig error:', err);
                      toast.error('Error: ' + err.message);
                    } finally {
                      setLoadingActions(prev => ({ ...prev, checkConfig: false }));
                    }
                  }}
                  disabled={loadingActions.checkConfig}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl disabled:opacity-50"
                >
                  {loadingActions.checkConfig ? 'Checking...' : 'Check Config'}
                </Button>
                <Button
                  onClick={async () => {
                    if (loadingActions.debugAdmin) return;
                    setLoadingActions(prev => ({ ...prev, debugAdmin: true }));
                    try {
                      await base44.functions.invoke('debugPlatformAdmin');
                      toast.success('✓ Debug complete!');
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    } finally {
                      setLoadingActions(prev => ({ ...prev, debugAdmin: false }));
                    }
                  }}
                  disabled={loadingActions.debugAdmin}
                  className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl disabled:opacity-50"
                >
                  {loadingActions.debugAdmin ? 'Debugging...' : 'Debug Admin'}
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const res = await base44.functions.invoke('checkFeeVault');
                      if (res.data.error) {
                        toast.error('Error: ' + res.data.error);
                      } else {
                        toast.success(`✓ Fee Vault: ◎${res.data.totalFeesSOL.toFixed(4)} SOL`);
                        alert(`Fee Vault Balance\n\nTotal Fees: ◎${res.data.totalFeesSOL.toFixed(4)} SOL (${res.data.totalFeesLamports} lamports)\n\nFee Vault PDA: ${res.data.feeVaultPda}\nAdmin Wallet: ${res.data.adminWallet}\n\nView on Solscan: ${res.data.solscanUrl}`);
                      }
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/30 text-white rounded-xl"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Check Fee Vault
                </Button>
                <Button
                  onClick={async () => {
                    if (!walletAddress) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    try {
                      const res = await base44.functions.invoke('checkFeeVault');
                      if (res.data.error) {
                        toast.error('Error: ' + res.data.error);
                      } else {
                        toast.success(`✓ Fee Vault: ◎${res.data.totalFeesSOL.toFixed(4)} SOL`);
                        alert(`Fee Vault Balance\n\nTotal Fees: ◎${res.data.totalFeesSOL.toFixed(4)} SOL (${res.data.totalFeesLamports} lamports)\n\nFee Vault PDA: ${res.data.feeVaultPda}\nAdmin Wallet: ${res.data.adminWallet}\n\nView on Solscan: ${res.data.solscanUrl}`);
                      }
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/30 text-white rounded-xl"
                >
                  💰 Check Fee Vault Balance
                </Button>
                <Button
                  onClick={async () => {
                    if (!walletAddress) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    try {
                      const res = await base44.functions.invoke('checkFeeVault');
                      if (res.data.error) {
                        toast.error('Error: ' + res.data.error);
                        return;
                      }
                      if (res.data.totalFeesSOL <= 0) {
                        toast.error('Fee vault is empty!');
                        return;
                      }
                      // Prompt user for amount
                      const amountStr = prompt(`Fee Vault Balance: ◎${res.data.totalFeesSOL.toFixed(4)} SOL\n\nEnter amount to withdraw (SOL):`, res.data.totalFeesSOL.toFixed(4));
                      if (!amountStr) return;
                      const amountSOL = parseFloat(amountStr);
                      if (isNaN(amountSOL) || amountSOL <= 0 || amountSOL > res.data.totalFeesSOL) {
                        toast.error('Invalid amount');
                        return;
                      }
                      // Prepare withdraw instruction
                      const withdrawRes = await base44.functions.invoke('withdrawFees', { amount_sol: amountSOL });
                      if (withdrawRes.data.error) {
                        toast.error('Error: ' + withdrawRes.data.error);
                        return;
                      }
                      setWithdrawFeesDialog({
                        instruction: withdrawRes.data.solana_instruction,
                        amountSOL,
                      });
                    } catch (err) {
                      toast.error('Error: ' + err.message);
                    }
                  }}
                  className="h-16 bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 text-white rounded-xl"
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Withdraw Fees
                </Button>
                <Button
                  onClick={async () => {
                    if (!walletAddress) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    // Get all settled/void markets
                    const bets = await base44.entities.Bet.list();
                    const settledBets = bets.filter(b => b.solana_market_pda && (b.status === 'settled' || b.status === 'void'));
                    
                    if (settledBets.length === 0) {
                      toast.error('No settled markets found!');
                      return;
                    }
                    
                    // Build options string
                    let options = 'Markets to Sweep Funds From:\n\n';
                    settledBets.forEach((bet, i) => {
                      options += `${i + 1}. ${bet.title}\n   ID: ${bet.id}\n   Status: ${bet.status}\n   Pool: ◎${bet.total_pool?.toFixed(4) || 0} SOL\n   PDA: ${bet.solana_market_pda}\n\n`;
                    });
                    options += '\nEnter the NUMBER (e.g., 1) or paste the ID:';
                    
                    const input = prompt(options);
                    if (!input) return;
                    
                    let marketId;
                    const numInput = parseInt(input);
                    if (!isNaN(numInput) && numInput >= 1 && numInput <= settledBets.length) {
                      marketId = settledBets[numInput - 1].id;
                    } else {
                      marketId = input;
                    }
                    
                    // Get the bet - use the stored PDA from database!
                    const bet = settledBets.find(b => b.id === marketId) || bets.find(b => b.id === marketId);
                    if (!bet || !bet.solana_market_pda) {
                      toast.error('Market not found or missing PDA!');
                      return;
                    }
                    
                    console.log('[Admin] Sweeping market with stored PDA:', bet.solana_market_pda);
                    
                    // Use on-chain program sweep (only working method for PDAs)
                    const sweepRes = await base44.functions.invoke('sweepMarketFunds', {
                      market_pda: bet.solana_market_pda,
                      admin_wallet: walletAddress,
                    });
                    
                    if (sweepRes.data.error) {
                      toast.error('Error: ' + sweepRes.data.error);
                      return;
                    }
                    
                    setSweepDialog({
                      instruction: sweepRes.data.solana_instruction,
                      marketPda: bet.solana_market_pda,
                      balance: sweepRes.data.balance,
                    });
                  }}
                  className="h-16 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/30 text-white rounded-xl"
                >
                  💰 Sweep Market Funds
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

        {initPlatformDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-purple-600/20 border border-purple-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-purple-400 mb-1">Initialize Platform</h3>
                  <p className="text-sm text-gray-400">One-time platform setup on Solana</p>
                </div>
                <SolanaTransactionSigner
                  instruction={initPlatformDialog.instruction}
                  amount="0"
                  isPlatformInit={true}
                  onSuccess={handleInitPlatformSuccess}
                  onError={(err) => {
                    toast.error('Failed: ' + err.message);
                    setInitPlatformDialog(null);
                  }}
                />
                <Button
                  onClick={() => setInitPlatformDialog(null)}
                  variant="outline"
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}

        {deployFuturesDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-emerald-600/20 border border-emerald-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-emerald-400 mb-1">Deploy Market {48 - deployFuturesDialog.remaining} of 48</h3>
                  <p className="text-sm text-gray-400">Sign each transaction to deploy markets one at a time. Remaining: {deployFuturesDialog.remaining}</p>
                </div>
                <SolanaTransactionSigner
                  instruction={deployFuturesDialog.instruction}
                  amount="0"
                  onSuccess={handleDeployFuturesSuccess}
                  onError={(err) => {
                    toast.error('Failed: ' + err.message);
                    setDeployFuturesDialog(null);
                  }}
                />
                <Button
                  onClick={() => setDeployFuturesDialog(null)}
                  variant="outline"
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}

        {deployMatchesDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-purple-600/20 border border-purple-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-purple-400 mb-1">Deploy Match {72 - deployMatchesDialog.remaining} of 72</h3>
                  <p className="text-sm text-gray-400">Sign each transaction to deploy matches one at a time. Remaining: {deployMatchesDialog.remaining}</p>
                </div>
                <SolanaTransactionSigner
                  instruction={deployMatchesDialog.instruction}
                  amount="0"
                  onSuccess={handleDeployMatchesSuccess}
                  onError={(err) => {
                    toast.error('Failed: ' + err.message);
                    setDeployMatchesDialog(null);
                  }}
                />
                <Button
                  onClick={() => setDeployMatchesDialog(null)}
                  variant="outline"
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}

        {withdrawFeesDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-green-600/20 border border-green-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-green-400 mb-1">Withdraw Fees</h3>
                  <p className="text-sm text-gray-400">Amount: ◎{withdrawFeesDialog.amountSOL.toFixed(4)} SOL</p>
                </div>
                <SolanaTransactionSigner
                  instruction={withdrawFeesDialog.instruction}
                  amount={withdrawFeesDialog.amountSOL.toFixed(4)}
                  onSuccess={handleWithdrawFeesSuccess}
                  onError={(err) => {
                    toast.error('Failed: ' + err.message);
                    setWithdrawFeesDialog(null);
                  }}
                />
                <Button
                  onClick={() => setWithdrawFeesDialog(null)}
                  variant="outline"
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          </div>
        )}

        {sweepDialog && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
              <div className="space-y-4">
                <div className="bg-orange-600/20 border border-orange-600/30 rounded-xl p-4">
                  <h3 className="font-heading font-bold text-lg text-orange-400 mb-1">Sweep Market Funds</h3>
                  <p className="text-sm text-gray-400">Balance: ◎{sweepDialog.balance?.sol.toFixed(6)} SOL ({sweepDialog.balance?.lamports} lamports)</p>
                </div>
                <SolanaTransactionSigner
                  instruction={sweepDialog.instruction}
                  amount={sweepDialog.balance?.sol.toFixed(6)}
                  onSuccess={() => {
                    toast.success('✓ Market funds swept to your wallet!');
                    setSweepDialog(null);
                  }}
                  onError={(err) => {
                    toast.error('Failed: ' + err.message);
                    setSweepDialog(null);
                  }}
                />
                <Button
                  onClick={() => setSweepDialog(null)}
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