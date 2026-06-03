import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trophy, X, Sparkles, Globe } from 'lucide-react';
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

export default function CreateCountryFutures() {
  const [open, setOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [firstPlaceOdds, setFirstPlaceOdds] = useState('');
  const [pendingInit, setPendingInit] = useState(null);
  const queryClient = useQueryClient();

  const calculateOdds = (firstOdds) => {
    const secondOdds = Math.max(1.5, firstOdds * 0.5);
    const thirdOdds = Math.max(1.2, firstOdds * 0.3);
    return {
      second: parseFloat(secondOdds.toFixed(2)),
      third: parseFloat(thirdOdds.toFixed(2)),
    };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCountry || !firstPlaceOdds) throw new Error('Missing data');
      
      const firstOdds = parseFloat(firstPlaceOdds);
      const { second, third } = calculateOdds(firstOdds);
      
      const outcomes = [
        { 
          label: `${selectedCountry.label} - 1st Place`, 
          position: '1st',
          flag: selectedCountry.flag,
          odds: firstOdds,
          pool: 0,
          lp_offers: 0,
        },
        { 
          label: `${selectedCountry.label} - 2nd Place`, 
          position: '2nd',
          flag: selectedCountry.flag,
          odds: second,
          pool: 0,
          lp_offers: 0,
        },
        { 
          label: `${selectedCountry.label} - 3rd Place`, 
          position: '3rd',
          flag: selectedCountry.flag,
          odds: third,
          pool: 0,
          lp_offers: 0,
        },
      ];

      const marketData = {
        title: `${selectedCountry.label} World Cup Finish`,
        subtitle: `Where will ${selectedCountry.label} finish?`,
        country: selectedCountry.label,
        country_flag: selectedCountry.flag,
        category: 'tournament',
        icon: selectedCountry.flag,
        status: 'coming_soon',
        open_until: '2026-07-19T19:00:00Z',
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

  const handleInitSuccess = async (result) => {
    console.log('Futures market init success:', result);
    
    if (pendingInit?.accounts?.market) {
      await base44.entities.FuturesMarket.update(pendingInit.futures_market_id, {
        solana_market_created: true,
        solana_market_pda: pendingInit.accounts.market,
      });
    }
    
    setPendingInit(null);
    queryClient.invalidateQueries({ queryKey: ['futuresMarkets'] });
    setOpen(false);
    resetForm();
    alert('Country futures market created on-chain! Transaction confirmed.');
  };

  const resetForm = () => {
    setSelectedCountry(null);
    setFirstPlaceOdds('');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-primary text-primary-foreground font-heading font-bold rounded-xl h-10">
            <Globe className="w-4 h-4 mr-2" /> Create Country Market
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Create Country Futures Market
            </DialogTitle>
          </DialogHeader>

          {pendingInit ? (
            <div className="space-y-4 py-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">Sign Transaction</p>
                <p className="text-xs text-muted-foreground">Deploy this country market to Solana</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingInit}
                amount={0}
                futures_market_id={pendingInit.futures_market_id}
                onSuccess={handleInitSuccess}
              />
              <Button variant="outline" size="sm" onClick={() => setPendingInit(null)} className="w-full">
                Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-xs mb-2 block">Select Country</Label>
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 bg-secondary/30 rounded-lg">
                  {WORLD_CUP_TEAMS.map(team => (
                    <button
                      key={team.label}
                      onClick={() => setSelectedCountry(team)}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                        selectedCountry?.label === team.label
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

              {selectedCountry && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div>
                    <Label className="text-xs">1st Place Odds (Winner)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1"
                      value={firstPlaceOdds}
                      onChange={e => setFirstPlaceOdds(e.target.value)}
                      placeholder="e.g. 5.0"
                      className="bg-secondary/50"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Enter winner odds - 2nd & 3rd place odds will be calculated automatically
                    </p>
                  </div>

                  {firstPlaceOdds && (
                    <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-accent mb-2">Calculated Odds:</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">🥇 1st Place:</span>
                        <span className="font-bold text-primary">{parseFloat(firstPlaceOdds).toFixed(2)}x</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">🥈 2nd Place:</span>
                        <span className="font-bold text-accent">{calculateOdds(parseFloat(firstPlaceOdds)).second.toFixed(2)}x</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">🥉 3rd Place:</span>
                        <span className="font-bold text-accent">{calculateOdds(parseFloat(firstPlaceOdds)).third.toFixed(2)}x</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              <Button
                onClick={() => createMutation.mutate()}
                disabled={!selectedCountry || !firstPlaceOdds || createMutation.isPending}
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