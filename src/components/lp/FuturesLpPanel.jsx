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
    const groupTeams = WORLD_CUP_GROUPS_2026[activeGroup]?.map(t => t.name) || [];
    return filteredMarkets.filter(m => 
      (m.status === 'open' || m.status === 'coming_soon') && 
      m.country && 
      groupTeams.includes(m.country)
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
      />

      {/* Markets Grid */}
      {activeGroup !== 'ALL' ? (
        <section id={`lp-group-${activeGroup}`} className="scroll-mt-24">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
              <span className="font-heading font-black text-lg text-primary">{activeGroup}</span>
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-foreground">Group {activeGroup}</h2>
              <p className="text-xs text-muted-foreground">{displayedMarkets.length} countries with LP markets</p>
            </div>
          </div>

          {displayedMarkets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        Object.entries(WORLD_CUP_GROUPS_2026).map(([groupName, teams]) => {
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
        })
      )}
    </div>
  );
}

function FuturesMarketLpCard({ market, onProvideLiquidity }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [amount, setAmount] = useState('');

  const activeOutcome = market.outcomes[selectedIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      className="relative rounded-2xl bg-card overflow-hidden transition-all group"
      style={{
        background: 'linear-gradient(145deg, rgba(15,10,30,0.95) 0%, rgba(26,16,64,0.9) 100%)',
      }}
    >
      {/* Animated gradient border frame */}
      <div className="absolute inset-0 rounded-2xl p-[2px] pointer-events-none">
        <div className="absolute inset-0 rounded-2xl" 
             style={{
               background: 'linear-gradient(45deg, #a69cf2, #14f195, #a69cf2, #14f195)',
               backgroundSize: '200% 200%',
               animation: 'gradientShift 3s ease infinite'
             }} />
      </div>
      
      {/* Inner content container */}
      <div className="relative z-10 rounded-2xl bg-[#0f0a1e]/95 backdrop-blur-sm m-[2px]">
      {/* Header with Flag & Country */}
      <div className="p-5 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="text-4xl shrink-0">{market.country_flag || '🌍'}</div>
          <div className="flex-1">
            <h3 className="font-heading font-black text-lg text-foreground">{market.country}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{market.subtitle || 'Tournament Finish'}</p>
          </div>
        </div>
      </div>

      {/* Position Selector (1st, 2nd, 3rd) */}
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block font-bold">Select Finish Position</label>
          <div className="grid grid-cols-3 gap-1.5 bg-secondary/30 p-1 rounded-xl border border-border/30">
            {market.outcomes.map((outcome, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedIndex(idx)}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  selectedIndex === idx
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {outcome.position || outcome.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Stats for Selected Position */}
        <div className="bg-secondary/40 rounded-xl p-3.5 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Odds:</span>
            <span className="font-bold text-primary text-sm">{activeOutcome.odds.toFixed(2)}x</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Pool:</span>
            <span className="font-bold">◎{activeOutcome.pool?.toFixed(2) || '0'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">LP Offers:</span>
            <span className="font-bold">{activeOutcome.lp_offers || 0}</span>
          </div>
        </div>

        {/* Explainer */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
          ⚠️ You're providing liquidity <strong className="text-destructive">AGAINST</strong> {market.country} finishing {activeOutcome.position.toLowerCase()}. If they don't reach this position, you profit!
        </div>

        {/* Amount Input */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-bold">LP Amount (◎ SOL)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-secondary/50 border border-border/50 text-lg font-heading font-bold h-12 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2 mt-2.5">
            {[0.5, 1, 5, 10].map(qa => (
              <button
                key={qa}
                onClick={() => setAmount(String(qa))}
                className="px-3 py-2 text-xs font-bold bg-secondary hover:bg-secondary/80 rounded-lg flex-1 transition-colors"
              >
                ◎{qa}
              </button>
            ))}
          </div>
        </div>

        {/* Provide LP Button */}
        <Button
          onClick={() => {
            onProvideLiquidity({
              ...activeOutcome,
              market_id: market.id,
            }, parseFloat(amount));
          }}
          disabled={!amount || parseFloat(amount) <= 0}
          className="w-full h-12 font-heading font-bold rounded-xl text-base transition-all hover:shadow-lg"
          style={{ 
            background: 'linear-gradient(135deg, #a69cf2, #8b84e8)',
            boxShadow: '0 0 20px rgba(166,156,242,0.4)'
          }}
        >
          <DollarSign className="w-5 h-5 mr-2" />
          Provide ◎{amount || '0'} LP for {activeOutcome.position}
        </Button>
      </div>
      </div>
    </motion.div>
  );
}