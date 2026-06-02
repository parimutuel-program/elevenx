import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import RecreateMarketButton from '@/components/admin/RecreateMarketButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trophy, Settings, Gavel, RefreshCw, Shield, Radio, CheckCircle2, Zap, Download, BarChart3, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // All hooks must be called unconditionally at the top
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
    queryFn: async () => {
      // Just return mock status - no need to call backend
      return { provider: 'manual', verified: false };
    },
    refetchInterval: 30000,
  });

  const { data: platformStatus } = useQuery({
    queryKey: ['platformStatus'],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('initPlatformConfig', {});
        return res.data;
      } catch (err) {
        console.error('Failed to check platform status:', err);
        return null;
      }
    },
    refetchInterval: 30000,
  });

  const [syncResult, setSyncResult] = useState(null);
  const [pendingPlatformInit, setPendingPlatformInit] = useState(null);
  const [platformInitialized, setPlatformInitialized] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['bets'] });
    },
    onError: (err) => setSyncResult('Error: ' + err.message),
  });

  const initPlatformMutation = useMutation({
    mutationFn: async () => {
      console.log('[Admin] Initializing platform config...');
      const response = await base44.functions.invoke('initPlatformConfig', {});
      console.log('[Admin] initPlatformConfig response:', response.data);
      if (response.data.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      console.log('[Admin] Mutation onSuccess:', data);
      if (data.alreadyExists) {
        alert('Platform config already initialized on-chain');
      } else if (data.solana_instruction) {
        console.log('[Admin] Setting pendingPlatformInit:', data.solana_instruction);
        setPendingPlatformInit(data.solana_instruction);
      } else {
        alert('Unexpected response: ' + JSON.stringify(data));
      }
    },
    onError: (err) => {
      console.error('[Admin] initPlatformMutation error:', err);
      alert('Failed to initialize platform: ' + err.message);
    },
  });

  const handlePlatformInitSuccess = (txResult) => {
    setPendingPlatformInit(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    alert('Platform initialized successfully! You can now create markets.');
  };

  const handlePlatformInitError = (err) => {
    console.error('Platform init failed:', err);
    setPendingPlatformInit(null);
    alert('Platform initialization failed: ' + err.message);
  };

  // Now conditional render after all hooks
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
        <div className="flex gap-2">
          <CreateMatchDialog />
        </div>
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

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Sync World Cup Matches */}
          <div className="bg-card border border-accent/20 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Download className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-bold text-foreground">Sync World Cup 2026 from API</p>
                  <p className="text-xs text-muted-foreground">Imports all matches & sets live odds automatically. Safe to run multiple times.</p>
                </div>
              </div>
              <Button
                onClick={() => { setSyncResult(null); syncMutation.mutate(); }}
                disabled={syncMutation.isPending}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-heading font-bold rounded-xl h-9"
              >
                {syncMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Syncing...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />Sync Now</>
                )}
              </Button>
            </div>
            {syncResult && (
              <p className="mt-3 text-xs text-accent bg-accent/10 rounded-lg px-3 py-2">{syncResult}</p>
            )}
          </div>

          {/* Platform Initialization */}
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
                  isPlatformInit={true}
                  onSuccess={handlePlatformInitSuccess}
                  onError={handlePlatformInitError}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingPlatformInit(null)}
                  className="w-full h-8 text-xs rounded-lg"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Platform Config</p>
                    <p className="text-xs text-muted-foreground">
                      {platformInitialized ? 'Already initialized on Solana' : 'Initialize the platform on Solana (one-time setup)'}
                    </p>
                  </div>
                </div>
                {platformInitialized ? (
                  <Badge className="bg-accent/20 text-accent text-xs py-1 px-3 rounded-lg">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Initialized
                  </Badge>
                ) : (
                  <Button
                    onClick={() => initPlatformMutation.mutate()}
                    disabled={initPlatformMutation.isPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold rounded-xl h-9"
                  >
                    {initPlatformMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                        Initializing...
                      </>
                    ) : (
                      'Initialize Platform'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Oracle Status Banner */}
          <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${oracleStatus?.provider === 'manual' ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`} />
              <div>
                <p className="text-sm font-bold text-foreground">Oracle Status: {oracleStatus?.provider === 'manual' ? 'Manual Verification' : 'Auto Settlement'}</p>
                <p className="text-xs text-muted-foreground">
                  {oracleStatus?.verified ? 'Oracle verified' : oracleStatus?.message || 'Admin verification required'}
                </p>
              </div>
            </div>
            <Radio className={`w-5 h-5 ${oracleStatus?.provider === 'manual' ? 'text-yellow-400' : 'text-green-500'}`} />
          </div>

          {/* Quick Stats */}
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
                <Gavel className="w-8 h-8 text-accent" />
                <div>
                  <p className="text-2xl font-heading font-bold text-foreground">{bets.length}</p>
                  <p className="text-xs text-muted-foreground">Active Markets</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Matches Tab */}
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

        {/* Bets Tab */}
        <TabsContent value="bets" className="space-y-4">
          <h2 className="font-heading font-bold text-lg flex items-center gap-2">
            <Gavel className="w-5 h-5 text-primary" />
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
            <Input value={form.venue} onChange={e => setForm({...form, venue: e.target.value})} className="bg-secondary/50" placeholder="MetLife Stadium, New Jersey" />
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

function AdminMatchRow({ match, bets, index }) {
  const queryClient = useQueryClient();
  const existingBet = bets.find(b => b.match_id === match.id);
  const [pendingMarketInit, setPendingMarketInit] = useState(null);

  // Check on-chain market status
  const { data: marketStatus } = useQuery({
    queryKey: ['marketStatus', match.id],
    queryFn: async () => {
      const res = await base44.functions.invoke('checkMarketStatus', { match_id: match.id });
      return res.data;
    },
    enabled: !!existingBet,
    refetchInterval: 10000,
  });

  const isMarketInitialized = existingBet?.solana_market_created || marketStatus?.status === 'initialized';

  const createBetMutation = useMutation({
    mutationFn: async () => {
      // First create the Bet entity
      const bet = await base44.entities.Bet.create({
        match_id: match.id,
        title: `${match.team_a} vs ${match.team_b}`,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        outcome_draw: 'Draw',
        open_until: match.match_time,
        status: 'open',
        fee_percent: 0,
        odds_a: 2.1,
        odds_b: 2.1,
        odds_draw: 2.1,
        oracle_odds_a: 210,
        oracle_odds_draw: 210,
        oracle_odds_b: 210,
        lp_amount_a: 0, lp_amount_b: 0, lp_amount_draw: 0,
        total_pool: 0, total_bettors: 0,
      });
      
      // Then create the market on-chain
      const marketRes = await base44.functions.invoke('createMarketOnChain', {
        bet_id: bet.id,
        match_id: match.id,
      });
      
      if (marketRes.data.solana_instruction) {
        setPendingMarketInit({
          instruction: marketRes.data.solana_instruction,
          betId: bet.id,
        });
      }
      
      return bet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['marketStatus', match.id] });
    },
  });

  const handleMarketInitSuccess = (txResult) => {
    setPendingMarketInit(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    queryClient.invalidateQueries({ queryKey: ['marketStatus', match.id] });
    alert('Market initialized on-chain!');
  };

  const handleMarketInitError = (err) => {
    console.error('Market init failed:', err);
    setPendingMarketInit(null);
    alert('Market initialization failed: ' + err.message);
  };

  const recreateMarketMutation = useMutation({
    mutationFn: ({ bet_id, match_id }) => base44.functions.invoke('createMarketOnChain', {
      bet_id,
      match_id,
      force_recreate: true,
    }),
    onSuccess: (data) => {
      if (data.solana_instruction) {
        alert('Market recreation instruction generated. Please sign the transaction in your wallet to complete.');
        // In a full implementation, we'd trigger the wallet signer here
      } else {
        alert(data.message || 'Market recreated');
      }
      queryClient.invalidateQueries({ queryKey: ['bets'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status) => base44.entities.Match.update(match.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-xl"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{match.team_a_flag || '🏳️'}</span>
        <div>
          <p className="font-heading font-bold text-sm">{match.team_a} vs {match.team_b}</p>
          <p className="text-[10px] text-muted-foreground">
            {match.match_time ? format(new Date(match.match_time), 'MMM d, HH:mm') : 'TBD'} · {match.venue || 'TBD'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge className="text-[10px] bg-secondary text-secondary-foreground">{match.status}</Badge>
        <Select value={match.status} onValueChange={(v) => updateStatusMutation.mutate(v)}>
          <SelectTrigger className="w-28 h-8 text-xs bg-secondary/50 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="finished">Finished</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {!existingBet && !pendingMarketInit && (
          <Button
            size="sm"
            onClick={() => createBetMutation.mutate()}
            disabled={createBetMutation.isPending}
            className="h-8 text-xs bg-primary text-primary-foreground font-heading rounded-lg"
          >
            {createBetMutation.isPending ? (
              <><div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" /> Creating...</>
            ) : (
              <><Plus className="w-3 h-3 mr-1" /> Initialize Market</>
            )}
          </Button>
        )}
        {pendingMarketInit && (
          <div className="w-64">
            <SolanaTransactionSigner
              instruction={pendingMarketInit.instruction}
              amount={0}
              onSuccess={handleMarketInitSuccess}
              onError={handleMarketInitError}
            />
          </div>
        )}
        {existingBet && isMarketInitialized && (
          <Badge className="bg-accent/20 text-accent text-[10px] py-1 px-3 rounded-lg">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Market Initialized
          </Badge>
        )}
        {existingBet && isMarketInitialized && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm('Recreate market on-chain with updated odds? This will overwrite existing market data.')) {
                recreateMarketMutation.mutate({ bet_id: existingBet.id, match_id: match.id });
              }
            }}
            disabled={recreateMarketMutation.isPending}
            className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 rounded-lg"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Recreate
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function AdminBetRow({ bet, matches, index }) {
  const queryClient = useQueryClient();
  const match = matches.find(m => m.id === bet.match_id);


  // Use announceWinner backend function for fixed-odds settlement
  const settleMutation = useMutation({
    mutationFn: async (winningOutcome) => {
      const res = await base44.functions.invoke('announceWinner', {
        bet_id: bet.id,
        winning_outcome: winningOutcome,
      });
      if (!res.data.success) throw new Error(res.data.error || 'Settlement failed');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
      alert(data.message);
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const userBets = await base44.entities.UserBet.filter({ bet_id: bet.id });
      for (const ub of userBets) {
        await base44.entities.UserBet.update(ub.id, { status: 'refunded', actual_payout: ub.amount });
      }
      await base44.entities.Bet.update(bet.id, { status: 'void' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bets'] });
    },
  });

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
      <Badge className={`text-[10px] ${
        bet.status === 'open' ? 'bg-accent/20 text-accent' :
        bet.status === 'settled' ? 'bg-primary/20 text-primary' :
        bet.status === 'void' ? 'bg-destructive/20 text-destructive' :
        'bg-secondary text-secondary-foreground'
      }`}>
        {bet.status}
      </Badge>
      </div>

      {bet.status === 'open' || bet.status === 'closed' ? (
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={() => settleMutation.mutate('a')} disabled={settleMutation.isPending}
            className="h-8 text-xs bg-primary/20 text-primary hover:bg-primary/30 rounded-lg flex-1">
            <Trophy className="w-3 h-3 mr-1" /> {bet.outcome_a}
          </Button>
          <Button size="sm" onClick={() => settleMutation.mutate('draw')} disabled={settleMutation.isPending}
            className="h-8 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg flex-1">
            <Trophy className="w-3 h-3 mr-1" /> Draw
          </Button>
          <Button size="sm" onClick={() => settleMutation.mutate('b')} disabled={settleMutation.isPending}
            className="h-8 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg flex-1">
            <Trophy className="w-3 h-3 mr-1" /> {bet.outcome_b}
          </Button>
        </div>
      ) : bet.status === 'settled' ? (
        <p className="text-xs text-muted-foreground mt-1">
          Winner: <span className="text-primary font-bold">
            {bet.winning_outcome === 'a' ? bet.outcome_a : bet.winning_outcome === 'b' ? bet.outcome_b : 'Draw'}
          </span>
        </p>
      ) : null}
    </motion.div>
  );
}