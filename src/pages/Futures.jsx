import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, Clock, ChevronRight, Lock, Trophy, Calendar, Loader } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import FuturesCard from '@/components/futures/FuturesCard';

export default function Futures() {
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('futures');

  // Fetch futures markets from database
  const { data: futuresMarkets = [], isLoading } = useQuery({
    queryKey: ['futures-markets'],
    queryFn: async () => {
      const markets = await base44.entities.FuturesMarket.list();
      return markets;
    },
  });

  const openMarkets = futuresMarkets.filter((m) => m.status === 'open');
  const comingMarkets = futuresMarkets.filter((m) => m.status === 'coming_soon');

  // Calculate totals for hero
  const totalPool = openMarkets.reduce((sum, m) =>
    sum + m.outcomes.reduce((s, o) => s + (o.pool || 0), 0), 0
  );
  const totalLpOffers = openMarkets.reduce((sum, m) =>
    sum + m.outcomes.reduce((s, o) => s + (o.lp_offers || 0), 0), 0
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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

          {/* Empty state */}
          {futuresMarkets.length === 0 && (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-heading font-bold text-lg mb-2">No Futures Markets Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first futures market from the admin panel
              </p>
              <Button
                onClick={() => window.location.href = '/admin'}
                className="bg-primary hover:bg-primary/90"
              >
                Go to Admin
              </Button>
            </div>
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