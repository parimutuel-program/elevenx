import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trophy, X, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

const WORLD_CUP_TEAMS = [
  { label: 'Brazil', flag: '🇧🇷' }, { label: 'France', flag: '🇫🇷' },
  { label: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, { label: 'Argentina', flag: '🇦🇷' },
  { label: 'Spain', flag: '🇪🇸' }, { label: 'Germany', flag: '🇩🇪' },
  { label: 'Portugal', flag: '🇵🇹' }, { label: 'Netherlands', flag: '🇳🇱' },
  { label: 'Belgium', flag: '🇧🇪' }, { label: 'Italy', flag: '🇮🇹' },
  { label: 'Croatia', flag: '🇭🇷' }, { label: 'Uruguay', flag: '🇺🇾' },
  { label: 'Colombia', flag: '🇨🇴' }, { label: 'Mexico', flag: '🇲🇽' },
  { label: 'USA', flag: '🇺🇸' }, { label: 'Morocco', flag: '🇲🇦' },
  { label: 'Japan', flag: '🇯🇵' }, { label: 'Senegal', flag: '🇸🇳' },
  { label: 'Denmark', flag: '🇩🇰' }, { label: 'Switzerland', flag: '🇨🇭' },
  { label: 'South Korea', flag: '🇰🇷' }, { label: 'Australia', flag: '🇦🇺' },
  { label: 'Nigeria', flag: '🇳🇬' }, { label: 'Egypt', flag: '🇪🇬' },
  { label: 'Iran', flag: '🇮🇷' }, { label: 'Saudi Arabia', flag: '🇸🇦' },
  { label: 'Canada', flag: '🇨🇦' }, { label: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  { label: 'Poland', flag: '🇵🇱' }, { label: 'Tunisia', flag: '🇹🇳' },
  { label: 'Ecuador', flag: '🇪🇨' }, { label: 'Cameroon', flag: '🇨🇲' },
  { label: 'Ghana', flag: '🇬🇭' }, { label: 'Algeria', flag: '🇩🇿' },
  { label: 'Costa Rica', flag: '🇨🇷' }, { label: 'Jamaica', flag: '🇯🇲' },
  { label: 'Panama', flag: '🇵🇦' }, { label: 'Serbia', flag: '🇷🇸' },
  { label: 'Ukraine', flag: '🇺🇦' }, { label: 'Sweden', flag: '🇸🇪' },
  { label: 'Austria', flag: '🇦🇹' }, { label: 'Czech Republic', flag: '🇨🇿' },
  { label: 'Chile', flag: '🇨🇱' }, { label: 'Peru', flag: '🇵🇪' },
  { label: 'Paraguay', flag: '🇵🇾' }, { label: 'Bolivia', flag: '🇧🇴' },
];

export default function CreateFuturesMarket() {
  const [open, setOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [teamOdds, setTeamOdds] = useState({});
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    category: 'tournament',
    icon: '🏆',
    open_until: '',
  });
  const [pendingInit, setPendingInit] = useState(null);
  const queryClient = useQueryClient();

  const toggleTeam = (teamLabel) => {
    setSelectedTeams(prev => 
      prev.includes(teamLabel) 
        ? prev.filter(t => t !== teamLabel)
        : [...prev, teamLabel]
    );
  };

  const updateOdds = (teamLabel, odds) => {
    setTeamOdds(prev => ({ ...prev, [teamLabel]: parseFloat(odds) || 0 }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const outcomes = selectedTeams.map(team => ({
        label: team,
        flag: WORLD_CUP_TEAMS.find(t => t.label === team)?.flag || '',
        odds: teamOdds[team] || 1.0,
        pool: 0,
        lp_offers: 0,
      }));

      // Convert local datetime to UTC (form.open_until is in user's local time: America/Costa_Rica)
      const openUntilUtc = form.open_until ? new Date(form.open_until).toISOString() : '2026-07-19T19:00:00Z';
      
      const marketData = {
        title: form.title,
        subtitle: form.subtitle,
        category: form.category,
        icon: form.icon,
        status: 'coming_soon',
        open_until: openUntilUtc,
        outcomes,
        total_volume: 0,
        solana_market_created: false,
        solana_market_pda: null,
      };

      const created = await base44.entities.FuturesMarket.create(marketData);
      return created;
    },
    onSuccess: async (createdMarket) => {
      const res = await base44.functions.invoke('createFuturesMarketOnChain', {
        futures_market_id: createdMarket.id,
      });
      
      if (res.data.error) throw new Error(res.data.error);
      
      if (res.data.solana_instruction) {
        setPendingInit(res.data.solana_instruction);
      } else if (res.data.alreadyExists) {
        alert('Market already exists on-chain!');
        queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
        setOpen(false);
        resetForm();
      }
    },
  });

  const handleInitSuccess = () => {
    setPendingInit(null);
    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
    setOpen(false);
    resetForm();
    alert('Futures market created and initialized on-chain!');
  };

  const resetForm = () => {
    setSelectedTeams([]);
    setTeamOdds({});
    setForm({ title: '', subtitle: '', category: 'tournament', icon: '🏆', open_until: '' });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-primary text-primary-foreground font-heading font-bold rounded-xl h-10">
            <Plus className="w-4 h-4 mr-2" /> Create Futures
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border/50 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Create Futures Market
            </DialogTitle>
          </DialogHeader>

          {pendingInit ? (
            <div className="space-y-4 py-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">Sign Transaction</p>
                <p className="text-xs text-muted-foreground">Deploy this futures market to Solana</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingInit}
                amount={0}
                onSuccess={handleInitSuccess}
              />
              <Button variant="outline" size="sm" onClick={() => setPendingInit(null)} className="w-full">
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Market Title</Label>
                  <Input 
                    value={form.title} 
                    onChange={e => setForm({...form, title: e.target.value})} 
                    placeholder="e.g. To Reach Final" 
                    className="bg-secondary/50" 
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <select
                    value={form.category}
                    onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full h-10 px-3 rounded-lg bg-secondary/50 border border-border text-sm"
                  >
                    <option value="tournament">Tournament</option>
                    <option value="player">Player</option>
                    <option value="special">Special</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Subtitle</Label>
                <Input 
                  value={form.subtitle} 
                  onChange={e => setForm({...form, subtitle: e.target.value})} 
                  placeholder="e.g. Teams that will make it to the championship match" 
                  className="bg-secondary/50" 
                />
              </div>

              <div>
                <Label className="text-xs">Betting Closes At</Label>
                <Input 
                  type="datetime-local"
                  value={form.open_until} 
                  onChange={e => setForm({...form, open_until: e.target.value})} 
                  className="bg-secondary/50" 
                />
                <p className="text-[10px] text-muted-foreground mt-1">When betting stops (e.g., final kickoff time)</p>
              </div>

              <div>
                <Label className="text-xs mb-2 block">Select Teams ({selectedTeams.length})</Label>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-secondary/30 rounded-lg">
                  {WORLD_CUP_TEAMS.map(team => (
                    <button
                      key={team.label}
                      onClick={() => toggleTeam(team.label)}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                        selectedTeams.includes(team.label)
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 bg-card hover:border-border'
                      }`}
                    >
                      <span className="text-lg">{team.flag}</span>
                      <span className="text-xs font-medium truncate">{team.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedTeams.length > 0 && (
                <div>
                  <Label className="text-xs mb-2 block">Set Odds for Selected Teams</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-secondary/30 rounded-lg">
                    {selectedTeams.map(team => (
                      <div key={team} className="flex items-center gap-2">
                        <span className="text-sm w-24 truncate">
                          {WORLD_CUP_TEAMS.find(t => t.label === team)?.flag} {team}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="Odds"
                          value={teamOdds[team] || ''}
                          onChange={e => updateOdds(team, e.target.value)}
                          className="bg-card h-8 text-sm w-20"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={() => createMutation.mutate()}
                disabled={!form.title || !form.subtitle || selectedTeams.length === 0 || createMutation.isPending}
                className="w-full bg-primary text-primary-foreground font-heading font-bold rounded-xl h-11"
              >
                {createMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Create & Deploy to Solana
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}