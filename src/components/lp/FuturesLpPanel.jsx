import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, DollarSign, Globe, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import GroupNavigation, { WORLD_CUP_GROUPS_2026 } from '@/components/futures/GroupNavigation';
import { Input } from '@/components/ui/input';

export default function FuturesLpPanel({ 
  futuresMarkets, 
  onProvideLiquidity, 
  isConnected,
  connect 
}) {
  const [activeGroup, setActiveGroup] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter markets by search query
  const filteredMarkets = searchQuery
    ? futuresMarkets.filter(m => 
        m.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : futuresMarkets;

  // Filter markets by active group
  const displayedMarkets = useMemo(() => {
    if (activeGroup === 'ALL') {
      return filteredMarkets.filter(m => 
        (m.status === 'open' || m.status === 'coming_soon') && m.country
      );
    }
    // Show test markets in ALL groups for testing convenience
    if (activeGroup === 'Test' || filteredMarkets.some(m => m.country === 'Test')) {
      const testMarkets = filteredMarkets.filter(m => m.country === 'Test');
      if (activeGroup === 'Test') return testMarkets;
    }
    const groupTeams = WORLD_CUP_GROUPS_2026[activeGroup]?.map(t => t.name) || [];
    return filteredMarkets.filter(m => 
      (m.status === 'open' || m.status === 'coming_soon') && 
      m.country && 
      (groupTeams.includes(m.country) || m.country === 'Test')
    );
  }, [filteredMarkets, activeGroup]);

  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/20 p-8 text-center"
        style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}>
        <Trophy className="w-12 h-12 text-primary mx-auto mb-4" />
        <h3 className="font-heading font-black text-xl text-white mb-2">Connect Wallet for Futures LP</h3>
        <p className="text-white/50 text-sm mb-5 max-w-xs mx-auto">Provide liquidity against tournament outcomes and earn yield.</p>
        <Button onClick={connect} className="font-heading font-bold px-8 h-11 rounded-xl"
          style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}>
          <Trophy className="w-4 h-4 mr-2" /> Connect Phantom
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search country (e.g. Brazil, Argentina)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-card border-border/50 pl-10 pr-4 py-3 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="text-xs font-bold">Clear</span>
          </button>
        )}
      </div>

      {/* Quick-Jump Group Navigation */}
      <GroupNavigation 
        onGroupClick={(groupName) => {
          setActiveGroup(groupName);
          if (groupName !== 'ALL') {
            const element = document.getElementById(`lp-group-${groupName}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }} 
        activeGroup={activeGroup} 
        showTestGroup={futuresMarkets.some(m => m.country === 'Test')}
      />

      {/* Markets Grid */}
      {activeGroup !== 'ALL' ? (
        <section id={`lp-group-${activeGroup}`} className="scroll-mt-24">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              activeGroup === 'Test' 
                ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30' 
                : 'bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30'
            }`}>
              {activeGroup === 'Test' ? (
                <span className="text-xl">🧪</span>
              ) : (
                <span className="font-heading font-black text-lg text-primary">{activeGroup}</span>
              )}
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-foreground">
                {activeGroup === 'Test' ? 'Test Market' : `Group ${activeGroup}`}
              </h2>
              <p className="text-xs text-muted-foreground">{displayedMarkets.length} countries with LP markets</p>
            </div>
          </div>

          {displayedMarkets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedMarkets.map((market, i) => (
                <FuturesMarketLpCard
                  key={market.id}
                  market={market}
                  onProvideLiquidity={onProvideLiquidity}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No markets available for this group</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Test Markets Section - show first if test markets exist */}
          {displayedMarkets.some(m => m.country === 'Test') && (
            <section id="lp-group-Test" className="scroll-mt-24 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 flex items-center justify-center">
                  <span className="text-xl">🧪</span>
                </div>
                <div>
                  <h2 className="font-heading font-bold text-base text-foreground">Test Market</h2>
                  <p className="text-xs text-muted-foreground">Quick test futures markets</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {displayedMarkets.filter(m => m.country === 'Test').map((market, i) => (
                  <FuturesMarketLpCard
                    key={market.id}
                    market={market}
                    onProvideLiquidity={onProvideLiquidity}
                  />
                ))}
              </div>
            </section>
          )}

          {/* World Cup Groups */}
          {Object.entries(WORLD_CUP_GROUPS_2026).map(([groupName, teams]) => {
            const groupMarkets = displayedMarkets.filter(m => 
              teams.some(t => t.name === m.country)
            );
            if (groupMarkets.length === 0) return null;

            return (
              <section key={groupName} id={`lp-group-${groupName}`} className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
                    <span className="font-heading font-black text-lg text-primary">{groupName}</span>
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-base text-foreground">Group {groupName}</h2>
                    <p className="text-xs text-muted-foreground">{groupMarkets.length} countries with LP markets</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                  {groupMarkets.map((market, i) => (
                    <FuturesMarketLpCard
                      key={market.id}
                      market={market}
                      onProvideLiquidity={onProvideLiquidity}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function FuturesMarketLpCard({ market, onProvideLiquidity }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [amount, setAmount] = useState('');

  const activeOutcome = market.outcomes[selectedIndex];
  
  // Check if market is ready for LP (must be created on-chain first)
  const isMarketReady = market.solana_market_created && market.solana_market_pda;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      className="relative rounded-3xl h-full overflow-hidden"
      style={{
        background: '#121212',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}
    >
      {/* Glow orbs */}
      <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
      <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
      {/* Grid lines decoration */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#a69cf2 1px, transparent 1px), linear-gradient(90deg, #a69cf2 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Content */}
      <div className="relative p-5 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="text-4xl filter drop-shadow-lg">{market.country_flag || '🌍'}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-bold text-lg text-white truncate">{market.country}</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Tournament Finish</p>
          </div>
        </div>

        {/* Position Selector */}
        <div className="mb-4">
          <div className="flex gap-1.5 bg-white/5 backdrop-blur-sm rounded-2xl p-1.5 border border-white/10">
            {market.outcomes.map((outcome, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedIndex(idx)}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                  selectedIndex === idx
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {outcome.position}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl p-4 mb-4 border border-white/10">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold mb-1">Odds</p>
              <p className="font-heading font-bold text-emerald-400 text-sm">{activeOutcome.odds.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold mb-1">Pool</p>
              <p className="font-heading font-bold text-white text-sm">◎{activeOutcome.pool?.toFixed(2) || '0'}</p>
            </div>
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-wider font-semibold mb-1">LPs</p>
              <p className="font-heading font-bold text-white text-sm">{activeOutcome.lp_offers || 0}</p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        {!isMarketReady && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-4">
            <p className="text-[10px] text-yellow-400/80 leading-relaxed">
              <span className="font-bold">⚠️ Not Ready:</span> Admin must deploy this market on-chain first. Check Admin Dashboard → Futures → Deploy.
            </p>
          </div>
        )}
        {isMarketReady && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-4">
            <p className="text-[10px] text-emerald-400/80 leading-relaxed">
              <span className="font-bold">Bet against</span> {market.country} finishing {activeOutcome.position.toLowerCase()}. Profit if they don't reach it.
            </p>
          </div>
        )}

        {/* Amount Section */}
        <div className="mt-auto space-y-3">
          <div>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white font-heading font-bold text-xl h-14 rounded-2xl px-4 focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/20"
            />
          </div>
          
          <div className="flex gap-2">
            {[0.5, 1, 5, 10].map(qa => (
              <button
                key={qa}
                onClick={() => setAmount(String(qa))}
                className="px-3 py-2.5 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex-1 transition-all text-white/70 hover:text-white"
              >
                ◎{qa}
              </button>
            ))}
          </div>

          <Button
            onClick={() => {
              onProvideLiquidity({
                ...activeOutcome,
                market_id: market.id,
              }, parseFloat(amount));
            }}
            disabled={!isMarketReady || !amount || parseFloat(amount) <= 0}
            className="w-full h-12 font-heading font-bold rounded-2xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              background: isMarketReady 
                ? 'linear-gradient(135deg, #21c45d 0%, #1a9f4a 100%)'
                : 'linear-gradient(135deg, #4a4a4a 0%, #3a3a3a 100%)',
              boxShadow: isMarketReady 
                ? '0 4px 20px rgba(33,196,93,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'none'
            }}
          >
            {!isMarketReady ? '⏳ Admin Must Deploy First' : `Provide ◎${amount || '0'} Liquidity`}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}