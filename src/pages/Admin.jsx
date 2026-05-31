import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trophy, Settings, Gavel, RefreshCw, Shield, Radio, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export default function Admin() {
  const { user } = useAuth();
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
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('oracleService', { matchId: 'test', provider: 'manual' });
        return res.data.oracleResult || {};
      } catch {
        return { provider: 'manual', verified: false };
      }
    },
    refetchInterval: 30000,
  });

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-black text-2xl">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage matches, bets, and settlements</p>
        </div>
        <div className="flex gap-2">
          <CreateMatchDialog />
        </div>
      </div>

      {/* Matches management */}
      <section>
        <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Matches ({matches.length})
        </h2>
        <div className="space-y-2">
          {matches.map((match, i) => (
            <AdminMatchRow key={match.id} match={match} bets={bets} index={i} />
          ))}
        </div>
      </section>

      {/* Bets management */}
      <section>
        <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
          <Gavel className="w-5 h-5 text-primary" />
          Bets ({bets.length})
        </h2>
        <div className="space-y-2">
          {bets.map((bet, i) => (
            <AdminBetRow key={bet.id} bet={bet} matches={matches} index={i} />
          ))}
        </div>
      </section>
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

  const createBetMutation = useMutation({
    mutationFn: () => base44.entities.Bet.create({
      match_id: match.id,
      title: `${match.team_a} vs ${match.team_b}`,
      outcome_a: match.team_a,
      outcome_b: match.team_b,
      open_until: match.match_time,
      status: 'open',
      fee_percent: 200,
      total_a: 0, total_b: 0, total_pool: 0, total_bettors: 0,
    }),
    onSuccess: () => {
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
        {!existingBet && (
          <Button
            size="sm"
            onClick={() => createBetMutation.mutate()}
            disabled={createBetMutation.isPending}
            className="h-8 text-xs bg-primary text-primary-foreground font-heading rounded-lg"
          >
            <Plus className="w-3 h-3 mr-1" /> Bet
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function AdminBetRow({ bet, matches, index }) {
  const queryClient = useQueryClient();
  const match = matches.find(m => m.id === bet.match_id);

  const settleMutation = useMutation({
    mutationFn: async (winningOutcome) => {
      // Get all user bets for this bet
      const userBets = await base44.entities.UserBet.filter({ bet_id: bet.id });
      const winnersPool = winningOutcome === 'a' ? (bet.total_a || 0) : (bet.total_b || 0);
      const losersPool = winningOutcome === 'a' ? (bet.total_b || 0) : (bet.total_a || 0);

      // Update each user bet
      for (const ub of userBets) {
        if (ub.outcome === winningOutcome) {
          const gross = ub.amount + (winnersPool > 0 ? (ub.amount / winnersPool) * losersPool : 0);
          const fee = gross * (bet.fee_percent || 200) / 10000;
          const payout = gross - fee;
          await base44.entities.UserBet.update(ub.id, { status: 'won', actual_payout: payout });
        } else {
          await base44.entities.UserBet.update(ub.id, { status: 'lost', actual_payout: 0 });
        }
      }

      // Handle edge case: no winners
      if (winnersPool === 0 && userBets.length > 0) {
        for (const ub of userBets) {
          await base44.entities.UserBet.update(ub.id, { status: 'refunded', actual_payout: ub.amount });
        }
      }

      await base44.entities.Bet.update(bet.id, { status: 'settled', winning_outcome: winningOutcome });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['myBets'] });
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
            Pool: ${(bet.total_pool || 0).toLocaleString()} · {bet.total_bettors || 0} bettors · Fee: {(bet.fee_percent || 200) / 100}%
          </p>
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
          <Button
            size="sm"
            onClick={() => settleMutation.mutate('a')}
            disabled={settleMutation.isPending}
            className="h-8 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg flex-1"
          >
            <Trophy className="w-3 h-3 mr-1" /> {bet.outcome_a} Wins
          </Button>
          <Button
            size="sm"
            onClick={() => settleMutation.mutate('b')}
            disabled={settleMutation.isPending}
            className="h-8 text-xs bg-accent/20 text-accent hover:bg-accent/30 rounded-lg flex-1"
          >
            <Trophy className="w-3 h-3 mr-1" /> {bet.outcome_b} Wins
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => voidMutation.mutate()}
            disabled={voidMutation.isPending}
            className="h-8 text-xs rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Void
          </Button>
        </div>
      ) : bet.status === 'settled' ? (
        <p className="text-xs text-muted-foreground mt-1">
          Winner: <span className="text-primary font-bold">{bet.winning_outcome === 'a' ? bet.outcome_a : bet.outcome_b}</span>
        </p>
      ) : null}
    </motion.div>
  );
}