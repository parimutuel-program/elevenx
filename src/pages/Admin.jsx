import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/WalletContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trophy, Shield, Radio, CheckCircle2, Zap, Download, BarChart3, List, Flame, Target, RefreshCw, TestTube, RefreshCcw, Rocket, Loader } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import AdminMatchRow from '@/components/admin/AdminMatchRow';
import AdminBetRow from '@/components/admin/AdminBetRow';
import AdminFuturesPanel from '@/components/admin/AdminFuturesPanel';
import CreateCountryFutures from '@/components/admin/CreateCountryFutures';

export default function Admin() {
  const { user } = useAuth();
  const { walletAddress, isConnected } = useWallet();
  const queryClient = useQueryClient();

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list('-created_date', 100),
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['bets'],
    queryFn: () => base44.entities.Bet.list('-created_date', 100),
  });

  const { data: futuresMarkets = [] } = useQuery({
    queryKey: ['futuresMarkets'],
    queryFn: () => base44.entities.FuturesMarket.list('-created_date', 50),
  });

  const { data: oracleStatus } = useQuery({
    queryKey: ['oracleStatus'],
    queryFn: async () => ({ provider: 'manual', verified: false }),
    refetchInterval: 30000,
  });

  const { data: platformStatus, refetch: refetchPlatformStatus } = useQuery({
    queryKey: ['platformStatus'],
    queryFn: async () => {
      try {
        // Get wallet address from localStorage (set by WalletContext after Phantom connects)
        const walletSession = localStorage.getItem('elevenx_wallet_session');
        const walletAddress = walletSession ? JSON.parse(walletSession).address : null;
        if (!walletAddress) {
          console.log('[Admin] No wallet connected yet');
          return null;
        }
        const res = await base44.functions.invoke('initPlatformConfig', { walletAddress });
        return res.data;
      } catch (err) {
        console.error('[Admin] initPlatformConfig error:', err);
        return null;
      }
    },
    refetchInterval: 30000,
    enabled: false, // Only call when user clicks button
  });

  const { data: platformConfigDetails, refetch: refetchPlatformConfig } = useQuery({
    queryKey: ['platformConfigDetails'],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('checkPlatformConfig', {});
        return res.data;
      } catch (err) {
        return null;
      }
    },
    enabled: false,
  });

  const [syncResult, setSyncResult] = useState(null);
  const [fetchOddsResult, setFetchOddsResult] = useState(null);
  const [pendingPlatformInit, setPendingPlatformInit] = useState(null);
  const [platformInitialized, setPlatformInitialized] = useState(false);
  const [pendingBulkMatchDeploy, setPendingBulkMatchDeploy] = useState(null);
  const [isBulkDeployingMatches, setIsBulkDeployingMatches] = useState(false);

  useEffect(() => {
    // Check if wallet is connected on mount
    const walletSession = localStorage.getItem('elevenx_wallet_session');
    if (walletSession) {
      refetchPlatformStatus();
    }
  }, []);

  useEffect(() => {
    if (platformStatus) {
      setPlatformInitialized(platformStatus.alreadyExists || !platformStatus.solana_instruction);
    }
  }, [platformStatus]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('syncWorldCupMatches', {});
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setSyncResult(data.message);
      queryClient.invalidateQueries({ queryKey: ['matches', 'bets'] });
    },
    onError: (err) => setSyncResult('Error: ' + err.message),
  });

  const fetchOddsMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('autoFetchOdds', {});
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setFetchOddsResult(data.message);
      queryClient.invalidateQueries({ queryKey: ['bets'] });
    },
    onError: (err) => setFetchOddsResult('Error: ' + err.message),
  });

  const createTestBetMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('createTestBetWithApiMatch', {});
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      alert(`Test bet created!\n${data.message}\nAPI Match ID: ${data.stats_api_match_id}`);
      queryClient.invalidateQueries({ queryKey: ['matches', 'bets'] });
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const createLiveOddsBetMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('createTestBetWithLiveOdds', {});
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      alert(`Bet created with LIVE ODDS!\n${data.message}\n\nOdds:\nHome: ${data.odds.home}\nDraw: ${data.odds.draw}\nAway: ${data.odds.away}\nBookmaker: ${data.odds.bookmaker}`);
      queryClient.invalidateQueries({ queryKey: ['matches', 'bets'] });
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const quickTestMarketMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('quickTestMarket', {});
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['matches', 'bets'] });
      // Auto-trigger market creation after bet is created
      try {
        const marketRes = await base44.functions.invoke('recreateMarketWithValidDates', {
          bet_id: data.bet_id,
          match_id: data.match_id,
        });
        if (marketRes.data.solana_instruction) {
          alert(`✓ Test market ready!\n\n${data.message}\n\nNow click "⚡ Test Mode" on the FFO vs FFO1 market to deploy it on-chain with timestamps ending in 5 minutes.`);
        }
      } catch (err) {
        alert(`✓ Bet created!\n${data.message}\n\nNote: Market deployment failed: ${err.message}`);
      }
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const initPlatformMutation = useMutation({
    mutationFn: async () => {
      // Get wallet address from localStorage (set by WalletContext after Phantom connects)
      const walletSession = localStorage.getItem('elevenx_wallet_session');
      const walletAddress = walletSession ? JSON.parse(walletSession).address : null;
      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect Phantom first.');
      }
      const response = await base44.functions.invoke('initPlatformConfig', { walletAddress });
      if (response.data.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.alreadyExists) {
        alert('Platform config already initialized on-chain');
        setPlatformInitialized(true);
      } else if (data.solana_instruction) {
        setPendingPlatformInit(data.solana_instruction);
      }
      refetchPlatformStatus();
    },
    onError: (err) => alert('Failed: ' + err.message),
  });

  const handlePlatformInitSuccess = () => {
    setPendingPlatformInit(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    alert('Platform initialized!');
  };

  const handleBulkDeployMatches = async () => {
    setIsBulkDeployingMatches(true);
    try {
      const res = await base44.functions.invoke('bulkDeployMatches', {});
      if (res.data.error) {
        alert('Error: ' + res.data.error);
        return;
      }
      
      if (res.data.instructions && res.data.instructions.length > 0) {
        setPendingBulkMatchDeploy({
          instructions: res.data.instructions,
          betUpdates: res.data.betUpdates,
          marketCount: res.data.marketCount,
          betsCreated: res.data.betsCreated || 0,
        });
      } else {
        alert(res.data.message || 'No matches to deploy');
      }
    } catch (error) {
      console.error('Bulk deploy matches failed:', error);
      alert('Failed to prepare bulk deploy: ' + error.message);
    } finally {
      setIsBulkDeployingMatches(false);
    }
  };

  const handleBulkMatchDeploySuccess = async (result) => {
    console.log('Bulk match deploy success:', result);
    
    if (pendingBulkMatchDeploy?.betUpdates) {
      for (const betUpdate of pendingBulkMatchDeploy.betUpdates) {
        await base44.entities.Bet.update(betUpdate.id, {
          solana_market_created: true,
          solana_market_pda: betUpdate.solana_market_pda,
        });
      }
    }
    
    setPendingBulkMatchDeploy(null);
    queryClient.invalidateQueries({ queryKey: ['bets', 'matches'] });
    alert(`✓ Successfully deployed ${pendingBulkMatchDeploy?.marketCount || 0} match markets to Solana!`);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-black text-2xl">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage matches, bets, and platform settings</p>
        </div>
        <CreateMatchDialog />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-lg bg-secondary/50 border border-border/50 rounded-xl">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="matches" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <Trophy className="w-3.5 h-3.5 mr-1.5" /> Matches
          </TabsTrigger>
          <TabsTrigger value="bets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <List className="w-3.5 h-3.5 mr-1.5" /> Bets
          </TabsTrigger>
          <TabsTrigger value="futures" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <Flame className="w-3.5 h-3.5 mr-1.5" /> Futures
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="bg-card border border-accent/20 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-bold text-foreground">Sync World Cup 2026 from API</p>
                  <p className="text-xs text-muted-foreground">Imports all matches & sets live odds automatically.</p>
                </div>
              </div>
              <Button
                onClick={() => { setSyncResult(null); syncMutation.mutate(); }}
                disabled={syncMutation.isPending}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold rounded-xl h-9"
              >
                {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
            {syncResult && <p className="mt-3 text-xs text-accent bg-accent/10 rounded-lg px-3 py-2">{syncResult}</p>}
          </div>

          <div className="bg-card border border-primary/20 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">Fetch Live Odds Now</p>
                  <p className="text-xs text-muted-foreground">Updates odds for all open bets from The Odds API.</p>
                </div>
              </div>
              <Button
                onClick={() => { setFetchOddsResult(null); fetchOddsMutation.mutate(); }}
                disabled={fetchOddsMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl h-9"
              >
                {fetchOddsMutation.isPending ? 'Fetching...' : 'Fetch Odds Now'}
              </Button>
            </div>
            {fetchOddsResult && (
              <p className={`mt-3 text-xs rounded-lg px-3 py-2 ${fetchOddsResult.includes('Error') ? 'text-destructive bg-destructive/10' : 'text-primary bg-primary/10'}`}>
                {fetchOddsResult}
              </p>
            )}
          </div>

          <div className="bg-card border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <TestTube className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-bold text-foreground">Create Test Bet (No Odds)</p>
                  <p className="text-xs text-muted-foreground">Creates a bet with API match (odds not available yet).</p>
                </div>
              </div>
              <Button
                onClick={() => createTestBetMutation.mutate()}
                disabled={createTestBetMutation.isPending}
                variant="outline"
                className="border-accent/50 text-accent hover:bg-accent/10 font-heading font-bold rounded-xl h-9"
              >
                {createTestBetMutation.isPending ? 'Creating...' : 'Create Test Bet'}
              </Button>
            </div>
          </div>

          <div className="bg-card border border-accent/30 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-bold text-foreground">Create Bet with LIVE ODDS</p>
                  <p className="text-xs text-muted-foreground">Creates a bet with real-time odds from bookmakers.</p>
                </div>
              </div>
              <Button
                onClick={() => createLiveOddsBetMutation.mutate()}
                disabled={createLiveOddsBetMutation.isPending}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold rounded-xl h-9"
              >
                {createLiveOddsBetMutation.isPending ? 'Creating...' : 'Create with Live Odds'}
              </Button>
            </div>
          </div>

          <div className="bg-card border border-accent/30 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-bold text-foreground">⚡ Quick Test: FFO vs FFO1 (5 min)</p>
                  <p className="text-xs text-muted-foreground">Creates match + bet + market ready to settle in 5 minutes</p>
                </div>
              </div>
              <Button
                onClick={() => quickTestMarketMutation.mutate()}
                disabled={quickTestMarketMutation.isPending}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold rounded-xl h-9"
              >
                {quickTestMarketMutation.isPending ? 'Creating...' : 'Create Quick Test'}
              </Button>
            </div>
            {quickTestMarketMutation.isSuccess && (
              <p className="mt-3 text-xs text-accent bg-accent/10 rounded-lg px-3 py-2">
                ✓ Test market created! Click ⚡ Test Mode on the FFO vs FFO1 market to deploy on-chain.
              </p>
            )}
          </div>

          <div className="bg-card border border-primary/20 rounded-xl p-4">
            {pendingPlatformInit ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Sign Platform Initialization</p>
                    <p className="text-xs text-muted-foreground">Sign the transaction with your Phantom wallet</p>
                  </div>
                </div>
                <SolanaTransactionSigner
                  instruction={pendingPlatformInit}
                  amount={0}
                  onSuccess={handlePlatformInitSuccess}
                />
                <Button variant="outline" size="sm" onClick={() => setPendingPlatformInit(null)} className="w-full h-8 text-xs rounded-lg">
                  Cancel
                </Button>
              </div>
            ) : platformInitialized ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-foreground">Platform Config</p>
                      <p className="text-xs text-muted-foreground">Already initialized on Solana</p>
                    </div>
                  </div>
                  <Badge className="bg-accent/20 text-accent text-xs py-1 px-3 rounded-lg">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Initialized
                  </Badge>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Admin Wallet:</span>
                    <span className="text-xs font-mono text-primary font-bold">
                      {platformConfigDetails?.admin ? `${platformConfigDetails.admin.slice(0, 6)}...${platformConfigDetails.admin.slice(-6)}` : 'Click Check to view'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Fee %:</span>
                    <span className="text-xs font-bold">{platformConfigDetails?.feePercent ?? '-'}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refetchPlatformConfig()}
                      className="flex-1 h-8 text-xs rounded-lg"
                    >
                      Check Config
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res = await base44.functions.invoke('debugPlatformAdmin', {});
                          if (res.data.admin) {
                            alert(`On-chain admin:\n${res.data.admin}\n\nYour wallet:\n${walletAddress || 'Not connected'}\n\nMatch: ${res.data.admin === walletAddress}`);
                          }
                        } catch (err) {
                          alert('Error: ' + err.message);
                        }
                      }}
                      className="flex-1 h-8 text-xs rounded-lg"
                    >
                      Debug Admin
                    </Button>
                  </div>
                  {platformConfigDetails?.admin && (
                    <div className="space-y-1 mt-2">
                      <p className="text-[9px] text-muted-foreground">
                        <span className="text-primary font-bold">Your wallet:</span> {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}` : 'Not connected'}
                      </p>
                      {walletAddress && walletAddress !== platformConfigDetails.admin && (
                        <p className="text-[9px] text-destructive">
                          ⚠️ Mismatch - your wallet must match the admin address to settle markets
                        </p>
                      )}
                      {walletAddress === platformConfigDetails.admin && (
                        <p className="text-[9px] text-accent font-bold">✓ Wallet matches admin address</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Platform Config</p>
                    <p className="text-xs text-muted-foreground">Initialize on Solana (one-time)</p>
                  </div>
                </div>
                <Button
                  onClick={() => initPlatformMutation.mutate()}
                  disabled={initPlatformMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl h-9"
                >
                  {initPlatformMutation.isPending ? 'Initializing...' : 'Initialize Platform'}
                </Button>
              </div>
            )}
          </div>

          <div className="bg-card border border-accent/20 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Rocket className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-bold text-foreground">Initialize All Match Markets</p>
                  <p className="text-xs text-muted-foreground">Deploy all matches to Solana in one click (creates bets if needed)</p>
                </div>
              </div>
              <Button
                onClick={handleBulkDeployMatches}
                disabled={isBulkDeployingMatches}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold rounded-xl h-9 px-6"
              >
                {isBulkDeployingMatches ? (
                  <><Loader className="w-4 h-4 mr-2 animate-spin" /> Preparing...</>
                ) : (
                  <><Rocket className="w-4 h-4 mr-2" /> Initialize All Matches</>
                )}
              </Button>
            </div>
          </div>

          <div className="bg-card border border-primary/20 rounded-xl p-4">
            <div className="mb-3">
              <h3 className="font-heading font-bold text-sm text-primary flex items-center gap-2">
                <RefreshCcw className="w-4 h-4" />
                3-Step Setup Wizard
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Clean database and rebuild in 3 safe steps</p>
            </div>
            
            <div className="grid gap-3">
              <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">1</div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Clear Database</p>
                    <p className="text-xs text-muted-foreground">Wipe all matches, bets, futures</p>
                  </div>
                </div>
                <Button
                  onClick={async () => {
                    if (!confirm('⚠️ This will DELETE all matches, bets, futures, user bets, and LP positions!\n\nContinue?')) return;
                    const res = await base44.functions.invoke('clearDatabase', {});
                    if (res.data.error) {
                      alert('❌ Error: ' + res.data.error);
                    } else {
                      alert(res.data.message);
                      queryClient.invalidateQueries({ queryKey: ['matches', 'bets', 'futuresMarkets'] });
                    }
                  }}
                  variant="destructive"
                  className="font-heading font-bold rounded-lg h-8 text-xs"
                >
                  Clear All
                </Button>
              </div>

              <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">2</div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Build Futures Markets</p>
                    <p className="text-xs text-muted-foreground">Create country futures with calculated odds</p>
                  </div>
                </div>
                <Button
                  onClick={async () => {
                    const res = await base44.functions.invoke('fetchAndCalculateOdds', {});
                    if (res.data.error) {
                      alert('❌ Error: ' + res.data.error);
                    } else {
                      alert(`✅ Success! ${res.data.countriesProcessed} countries processed.`);
                      queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
                    }
                  }}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold rounded-lg h-8 text-xs"
                >
                  Build Futures
                </Button>
              </div>

              <div className="flex items-center justify-between bg-secondary/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">3</div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Fetch Match Markets</p>
                    <p className="text-xs text-muted-foreground">Sync matches & live odds from API</p>
                  </div>
                </div>
                <Button
                  onClick={async () => {
                    const res = await base44.functions.invoke('syncWorldCupMatches', {});
                    if (res.data.error) {
                      alert('❌ Error: ' + res.data.error);
                    } else {
                      alert(`✅ Success! ${res.data.created} new matches created.`);
                      queryClient.invalidateQueries({ queryKey: ['matches', 'bets'] });
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-lg h-8 text-xs"
                >
                  Fetch Matches
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-card border border-primary/20 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">Update All Betting Windows</p>
                  <p className="text-xs text-muted-foreground">Sets open_until = match kickoff + 1 hour for all bets (traditional bookie style)</p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  const res = await base44.functions.invoke('bulkUpdateBettingWindows', {});
                  if (res.data.error) {
                    alert('Error: ' + res.data.error);
                  } else {
                    alert(`✅ Success! Updated ${res.data.updated} bets with proper betting windows.\nErrors: ${res.data.errors || 0}`);
                    queryClient.invalidateQueries({ queryKey: ['bets'] });
                  }
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl h-9"
              >
                Update All Bets
              </Button>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${oracleStatus?.provider === 'manual' ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`} />
              <div>
                <p className="text-sm font-bold text-foreground">Oracle: {oracleStatus?.provider === 'manual' ? 'Manual' : 'Auto'}</p>
                <p className="text-xs text-muted-foreground">{oracleStatus?.verified ? 'Verified' : 'Admin verification required'}</p>
              </div>
            </div>
            <Radio className={`w-5 h-5 ${oracleStatus?.provider === 'manual' ? 'text-yellow-400' : 'text-green-500'}`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Trophy className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-heading font-bold text-foreground">{matches.length}</p>
                  <p className="text-xs text-muted-foreground">Total Matches</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                  <List className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-heading font-bold text-foreground">{bets.length}</p>
                  <p className="text-xs text-muted-foreground">Active Markets</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="matches" className="space-y-4">
          <h2 className="font-heading font-bold text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Matches ({matches.length})
          </h2>
          <div className="space-y-2">
            {matches.map((match, i) => (
              <AdminMatchRow key={match.id} match={match} bets={bets} index={i} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bets" className="space-y-4">
          <h2 className="font-heading font-bold text-lg flex items-center gap-2">
            <List className="w-5 h-5 text-primary" />
            Bets ({bets.length})
          </h2>
          <div className="space-y-2">
            {bets.map((bet, i) => (
              <AdminBetRow key={bet.id} bet={bet} matches={matches} index={i} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="futures" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading font-bold text-lg flex items-center gap-2">
                <Flame className="w-5 h-5 text-primary" />
                Country Futures Markets
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Create markets for each country - 1st, 2nd, 3rd place outcomes</p>
            </div>
            <CreateCountryFutures />
          </div>

          <div className="bg-card border border-primary/20 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <RefreshCcw className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">Fetch & Calculate All Odds</p>
                  <p className="text-xs text-muted-foreground">Fetches winner odds from API, auto-calculates 2nd/3rd place for all countries</p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  const res = await base44.functions.invoke('fetchAndCalculateOdds', {});
                  if (res.data.error) {
                    alert('Error: ' + res.data.error);
                  } else {
                    alert(`Success! ${res.data.countriesProcessed} countries processed with calculated odds.`);
                    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
                  }
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl h-9"
              >
                Fetch All Odds
              </Button>
            </div>
          </div>

          <AdminFuturesPanel />
        </TabsContent>
      </Tabs>

      {/* Bulk Deploy Matches Transaction Modal */}
      {pendingBulkMatchDeploy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-lg w-full">
            <div className="space-y-4">
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <p className="text-sm font-bold text-accent mb-1">Initialize {pendingBulkMatchDeploy.marketCount} Match Markets</p>
                <p className="text-xs text-muted-foreground">
                  {pendingBulkMatchDeploy.betsCreated > 0 && `Created ${pendingBulkMatchDeploy.betsCreated} new bet entities. `}
                  Deploying {pendingBulkMatchDeploy.marketCount} matches to Solana.
                </p>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2">
                <p className="text-xs font-bold text-foreground mb-2">Matches to deploy:</p>
                {pendingBulkMatchDeploy.instructions.slice(0, 10).map((inst, idx) => (
                  <div key={idx} className="bg-secondary/30 rounded-lg p-2 flex items-center justify-between">
                    <span className="text-xs font-bold">{inst.matchId?.slice(0, 8)}...{inst.matchId?.slice(-4)}</span>
                    <Badge className="text-[9px] bg-accent/20 text-accent">Match #{idx + 1}</Badge>
                  </div>
                ))}
                {pendingBulkMatchDeploy.instructions.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">+{pendingBulkMatchDeploy.instructions.length - 10} more</p>
                )}
              </div>

              <SolanaTransactionSigner
                instruction={pendingBulkMatchDeploy.instructions[0]}
                amount={0}
                betId={pendingBulkMatchDeploy.instructions[0]?.betId}
                onSuccess={handleBulkMatchDeploySuccess}
              />
              
              <Button variant="outline" size="sm" onClick={() => setPendingBulkMatchDeploy(null)} className="w-full">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateMatchDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    team_a: '', team_b: '', team_a_flag: '', team_b_flag: '',
    group_stage: '', match_time: '', venue: '', status: 'upcoming',
  });
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Match.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      setOpen(false);
      setForm({ team_a: '', team_b: '', team_a_flag: '', team_b_flag: '', group_stage: '', match_time: '', venue: '', status: 'upcoming' });
    },
  });

  const createQuickTestMatch = async () => {
    const now = new Date();
    const startTime = new Date(now.getTime() + 4 * 60 * 1000); // 4 minutes from now
    const endTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    
    try {
      await base44.entities.Match.create({
        team_a: 'FFO',
        team_b: 'FFO1',
        team_a_flag: '🔵',
        team_b_flag: '🔴',
        group_stage: 'Test Match',
        match_time: startTime.toISOString(),
        venue: 'Test Arena',
        status: 'upcoming',
      });
      
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      setOpen(false);
      alert('Test match created! Starts in 4 min, ends in 5 min.');
    } catch (err) {
      alert('Failed to create test match: ' + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground font-heading font-bold rounded-xl h-10">
          <Plus className="w-4 h-4 mr-2" /> Add Match
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Create Match</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Button
            onClick={createQuickTestMatch}
            disabled={createMutation.isPending}
            className="w-full bg-accent text-accent-foreground font-heading font-bold rounded-xl h-10"
          >
            <Zap className="w-4 h-4 mr-2" /> Quick Test: FFO vs FFO1 (4min)
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or create custom</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Team A</Label>
              <Input value={form.team_a} onChange={e => setForm({...form, team_a: e.target.value})} className="bg-secondary/50" />
            </div>
            <div>
              <Label className="text-xs">Team B</Label>
              <Input value={form.team_b} onChange={e => setForm({...form, team_b: e.target.value})} className="bg-secondary/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Flag A (emoji)</Label>
              <Input value={form.team_a_flag} onChange={e => setForm({...form, team_a_flag: e.target.value})} className="bg-secondary/50" placeholder="🇧🇷" />
            </div>
            <div>
              <Label className="text-xs">Flag B (emoji)</Label>
              <Input value={form.team_b_flag} onChange={e => setForm({...form, team_b_flag: e.target.value})} className="bg-secondary/50" placeholder="🇩🇪" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Group / Round</Label>
            <Input value={form.group_stage} onChange={e => setForm({...form, group_stage: e.target.value})} className="bg-secondary/50" placeholder="Group A" />
          </div>
          <div>
            <Label className="text-xs">Match Time</Label>
            <Input type="datetime-local" value={form.match_time} onChange={e => setForm({...form, match_time: e.target.value})} className="bg-secondary/50" />
          </div>
          <div>
            <Label className="text-xs">Venue</Label>
            <Input value={form.venue} onChange={e => setForm({...form, venue: e.target.value})} className="bg-secondary/50" placeholder="MetLife Stadium" />
          </div>
          <Button
            onClick={() => createMutation.mutate(form)}
            disabled={!form.team_a || !form.team_b || !form.match_time || createMutation.isPending}
            className="w-full bg-primary text-primary-foreground font-heading font-bold rounded-xl h-10"
          >
            Create Match
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}