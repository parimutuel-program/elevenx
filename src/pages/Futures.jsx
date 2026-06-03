import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, Clock, ChevronRight, Lock, Trophy, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FuturesCard from '@/components/futures/FuturesCard';

// All 48 World Cup 2026 qualified teams (based on current qualifications + projections)
const WORLD_CUP_TEAMS = [
  // Top Favorites (Odds 4.0 - 8.0)
  { label: 'Brazil', flag: '🇧🇷', odds: 4.50, pool: 2840, lp_offers: 12 },
  { label: 'France', flag: '🇫🇷', odds: 5.00, pool: 2320, lp_offers: 9 },
  { label: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: 6.00, pool: 1890, lp_offers: 7 },
  { label: 'Argentina', flag: '🇦🇷', odds: 6.50, pool: 1650, lp_offers: 6 },
  { label: 'Spain', flag: '🇪🇸', odds: 7.00, pool: 1420, lp_offers: 5 },
  { label: 'Germany', flag: '🇩🇪', odds: 9.00, pool: 1180, lp_offers: 4 },
  // Strong Contenders (Odds 10 - 25)
  { label: 'Portugal', flag: '🇵🇹', odds: 11.00, pool: 890, lp_offers: 3 },
  { label: 'Netherlands', flag: '🇳🇱', odds: 13.00, pool: 720, lp_offers: 3 },
  { label: 'Belgium', flag: '🇧🇪', odds: 15.00, pool: 580, lp_offers: 2 },
  { label: 'Italy', flag: '🇮🇹', odds: 17.00, pool: 490, lp_offers: 2 },
  { label: 'Croatia', flag: '🇭🇷', odds: 20.00, pool: 380, lp_offers: 2 },
  { label: 'Uruguay', flag: '🇺🇾', odds: 23.00, pool: 290, lp_offers: 1 },
  // Dark Horses (Odds 26 - 60)
  { label: 'Colombia', flag: '🇨🇴', odds: 26.00, pool: 240, lp_offers: 1 },
  { label: 'Mexico', flag: '🇲🇽', odds: 30.00, pool: 210, lp_offers: 1 },
  { label: 'USA', flag: '🇺🇸', odds: 35.00, pool: 180, lp_offers: 1 },
  { label: 'Morocco', flag: '🇲🇦', odds: 40.00, pool: 150, lp_offers: 1 },
  { label: 'Japan', flag: '🇯🇵', odds: 45.00, pool: 120, lp_offers: 1 },
  { label: 'Senegal', flag: '🇸🇳', odds: 50.00, pool: 95, lp_offers: 1 },
  { label: 'Denmark', flag: '🇩🇰', odds: 55.00, pool: 78, lp_offers: 1 },
  { label: 'Switzerland', flag: '🇨🇭', odds: 60.00, pool: 62, lp_offers: 1 },
  // Long Shots (Odds 70 - 200)
  { label: 'South Korea', flag: '🇰🇷', odds: 70.00, pool: 48, lp_offers: 1 },
  { label: 'Australia', flag: '🇦🇺', odds: 80.00, pool: 39, lp_offers: 1 },
  { label: 'Nigeria', flag: '🇳🇬', odds: 90.00, pool: 32, lp_offers: 1 },
  { label: 'Egypt', flag: '🇪🇬', odds: 100.00, pool: 26, lp_offers: 1 },
  { label: 'Iran', flag: '🇮🇷', odds: 120.00, pool: 21, lp_offers: 1 },
  { label: 'Saudi Arabia', flag: '🇸🇦', odds: 140.00, pool: 17, lp_offers: 1 },
  { label: 'Canada', flag: '🇨🇦', odds: 160.00, pool: 13, lp_offers: 1 },
  { label: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', odds: 180.00, pool: 10, lp_offers: 1 },
  { label: 'Poland', flag: '🇵🇱', odds: 200.00, pool: 8, lp_offers: 1 },
  // Massive Outsiders (Odds 250+)
  { label: 'Tunisia', flag: '🇹🇳', odds: 250.00, pool: 5, lp_offers: 1 },
  { label: 'Ecuador', flag: '🇪🇨', odds: 300.00, pool: 4, lp_offers: 1 },
  { label: 'Cameroon', flag: '🇨🇲', odds: 350.00, pool: 3, lp_offers: 1 },
  { label: 'Ghana', flag: '🇬🇭', odds: 400.00, pool: 2, lp_offers: 1 },
  { label: 'Algeria', flag: '🇩🇿', odds: 450.00, pool: 2, lp_offers: 1 },
  { label: 'Costa Rica', flag: '🇨🇷', odds: 500.00, pool: 1, lp_offers: 1 },
  { label: 'Jamaica', flag: '🇯🇲', odds: 600.00, pool: 1, lp_offers: 1 },
  { label: 'Panama', flag: '🇵🇦', odds: 750.00, pool: 1, lp_offers: 1 },
];

const FUTURES_MARKETS = [
  {
    id: 'winner-2026',
    category: 'tournament',
    title: 'World Cup 2026 Winner',
    subtitle: 'Who will lift the trophy in North America?',
    icon: '🏆',
    status: 'open',
    open_until: '2026-07-19T00:00:00Z',
    outcomes: WORLD_CUP_TEAMS,
  },
  {
    id: 'golden-boot',
    category: 'player',
    title: 'Golden Boot Winner',
    subtitle: 'Top scorer of the tournament',
    icon: '👟',
    status: 'open',
    open_until: '2026-06-11T00:00:00Z',
    outcomes: [
      { label: 'Kylian Mbappé', flag: '🇫🇷', odds: 5.50, pool: 1240, lp_offers: 5 },
      { label: 'Erling Haaland', flag: '🇳🇴', odds: 6.00, pool: 980, lp_offers: 4 },
      { label: 'Vinicius Jr.', flag: '🇧🇷', odds: 7.00, pool: 820, lp_offers: 3 },
      { label: 'Harry Kane', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: 8.00, pool: 690, lp_offers: 3 },
      { label: 'Jude Bellingham', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', odds: 9.00, pool: 580, lp_offers: 2 },
      { label: 'Lionel Messi', flag: '🇦🇷', odds: 12.00, pool: 420, lp_offers: 2 },
      { label: 'Neymar Jr.', flag: '🇧🇷', odds: 14.00, pool: 350, lp_offers: 2 },
      { label: 'Mohamed Salah', flag: '🇪🇬', odds: 16.00, pool: 280, lp_offers: 1 },
      { label: 'Lautaro Martínez', flag: '🇦🇷', odds: 18.00, pool: 220, lp_offers: 1 },
      { label: 'Victor Osimhen', flag: '🇳🇬', odds: 20.00, pool: 180, lp_offers: 1 },
    ],
  },
  {
    id: 'to-final',
    category: 'tournament',
    title: 'To Reach Final',
    subtitle: 'Teams that will make it to the championship match',
    icon: '🎯',
    status: 'open',
    open_until: '2026-07-15T00:00:00Z',
    outcomes: WORLD_CUP_TEAMS.map(t => ({
      ...t,
      odds: parseFloat((t.odds / 2).toFixed(2)),
      pool: Math.round(t.pool / 3),
      lp_offers: Math.max(1, Math.round(t.lp_offers / 2)),
    })),
  },
  {
    id: 'group-winners',
    category: 'special',
    title: 'Group Stage Winners',
    subtitle: 'Teams to win their qualification groups',
    icon: '📊',
    status: 'coming_soon',
    open_until: '2026-06-25T00:00:00Z',
    outcomes: [],
  },
];

export default function Futures() {
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('futures');

  const openMarkets = FUTURES_MARKETS.filter(m => m.status === 'open');
  const comingMarkets = FUTURES_MARKETS.filter(m => m.status === 'coming_soon');

  // Calculate totals for hero
  const totalPool = openMarkets.reduce((sum, m) => 
    sum + m.outcomes.reduce((s, o) => s + (o.pool || 0), 0), 0);
  const totalLpOffers = openMarkets.reduce((sum, m) => 
    sum + m.outcomes.reduce((s, o) => s + (o.lp_offers || 0), 0), 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-secondary/50 border border-border/50 rounded-xl p-1">
          <TabsTrigger 
            value="futures" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-bold rounded-lg transition-all flex items-center gap-2"
          >
            <Trophy className="w-4 h-4" />
            Futures LP
          </TabsTrigger>
          <TabsTrigger 
            value="matches" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-bold rounded-lg transition-all flex items-center gap-2"
            onClick={() => window.location.href = '/lp'}
          >
            <Calendar className="w-4 h-4" />
            Live Match LP
          </TabsTrigger>
        </TabsList>

        <TabsContent value="futures" className="mt-6">
      {/* Hero */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-3xl overflow-hidden p-7"
        style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #0d0520 50%, #0a1a2e 100%)' }}
      >
        {/* Glow orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #a69cf2, transparent)' }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Futures Markets</span>
            <Badge className="ml-auto text-[10px] bg-primary/20 text-primary border border-primary/30">Beta</Badge>
          </div>
          
          <h1 className="font-heading font-black text-3xl text-white mb-2">Long-Range Bets</h1>
          <p className="text-white/50 text-sm max-w-md">
            Bet on tournament outcomes before they happen. Fixed odds, locked in at time of placement.
          </p>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-5">
            <div>
              <p className="text-white font-heading font-bold text-xl">{openMarkets.length}</p>
              <p className="text-white/40 text-[10px]">Open Markets</p>
            </div>
            <div>
              <p className="text-white font-heading font-bold text-xl">◎{(totalPool / 1000).toFixed(2)}K</p>
              <p className="text-white/40 text-[10px]">Total Pool</p>
            </div>
            <div>
              <p className="text-white font-heading font-bold text-xl">{totalLpOffers}</p>
              <p className="text-white/40 text-[10px]">LP Offers</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Open markets */}
      <section>
        <h2 className="font-heading font-bold text-base mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Active Futures
        </h2>
        <div className="space-y-5">
          {openMarkets.map((market, index) => (
            <FuturesCard
              key={market.id}
              market={market}
              index={index}
              selected={selected}
              onSelect={setSelected}
              onBet={(m, outcome) => console.log('Place bet:', m.title, outcome)}
            />
          ))}
        </div>
      </section>

      {/* Coming soon */}
      {comingMarkets.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-base mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Opening Soon
          </h2>
          <div className="space-y-3">
            {comingMarkets.map((market, index) => (
              <motion.div 
                key={market.id}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: index * 0.05 }}
                className="bg-card border border-border/30 rounded-2xl p-5 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{market.icon}</span>
                    <div>
                      <p className="font-heading font-bold text-sm">{market.title}</p>
                      <p className="text-xs text-muted-foreground">{market.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Coming soon</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* CTA banner */}
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-accent/20 bg-accent/5 p-5 flex items-center justify-between gap-4"
      >
        <div>
          <p className="font-heading font-bold text-sm text-accent mb-1">Provide Futures Liquidity</p>
          <p className="text-xs text-muted-foreground">LPs can back futures outcomes and earn when bettors lose.</p>
        </div>
        <Button 
          variant="outline" 
          className="border-accent/40 text-accent hover:bg-accent/10 rounded-xl text-xs font-bold shrink-0"
          onClick={() => window.location.href = '/lp'}
        >
          Go to Match LP <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </motion.div>
        </TabsContent>

        <TabsContent value="matches" className="mt-6">
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="font-heading font-bold text-lg mb-2">Live Match LP</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Provide liquidity for individual match markets with fixed odds.
            </p>
            <Button 
              onClick={() => window.location.href = '/lp'}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Go to Match LP Dashboard
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}