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
import { Plus, Trophy, Shield, Radio, CheckCircle2, Zap, Download, BarChart3, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import AdminMatchRow from '@/components/admin/AdminMatchRow';
import AdminBetRow from '@/components/admin/AdminBetRow';

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
  const [pendingPlatformInit, setPendingPlatformInit] = useState(null);
  const [platformInitialized, setPlatformInitialized] = useState(false);

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
        <TabsList className="grid grid-cols-3 w-full max-w-md bg-secondary/50 border border-border/50 rounded-xl">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="matches" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <Trophy className="w-3.5 h-3.5 mr-1.5" /> Matches
          </TabsTrigger>
          <TabsTrigger value="bets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-heading font-bold text-xs rounded-lg">
            <List className="w-3.5 h-3.5 mr-1.5" /> Bets
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
      </Tabs>
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