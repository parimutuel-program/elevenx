import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, DollarSign, Search, TrendingUp, Globe } from 'lucide-react';
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
        })
      )}
    </div>
  );
}

function FuturesMarketLpCard({ market, onProvideLiquidity }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [amount, setAmount] = useState('');

  const activeOutcome = market.outcomes[selectedIndex];
  const potentialReturn = amount && parseFloat(amount) > 0 && activeOutcome.odds > 0 
    ? (parseFloat(amount) * activeOutcome.odds).toFixed(2) 
    : '0.00';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -8, scale: 1.02 }}
      className="relative rounded-3xl h-full overflow-hidden group"
      style={{
        background: 'linear-gradient(145deg, rgba(20,30,48,0.95) 0%, rgba(15,10,30,0.98) 100%)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)'
      }}
    >
      {/* Animated glow effects */}
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-500" style={{ background: 'radial-gradient(circle, #21c45d 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-15 group-hover:opacity-25 transition-opacity duration-500" style={{ background: 'radial-gradient(circle, #a69cf2 0%, transparent 70%)' }} />
      
      {/* Content */}
      <div className="relative p-6 h-full flex flex-col">
        {/* Header with Country Flag */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="text-5xl filter drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-300">{market.country_flag || '🌍'}</div>
            <div>
              <h3 className="font-heading font-black text-xl text-white tracking-tight">{market.country}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Trophy className="w-3 h-3 text-amber-400" />
                <p className="text-[9px] text-amber-400/90 uppercase tracking-widest font-black">Tournament Futures</p>
              </div>
            </div>
          </div>
        </div>

        {/* Position Selector - Enhanced */}
        <div className="mb-5">
          <p className="text-[9px] text-white/50 uppercase tracking-wider font-bold mb-2">Select Position</p>
          <div className="flex gap-2 bg-gradient-to-r from-white/8 to-white/3 backdrop-blur-md rounded-2xl p-1.5 border border-white/12">
            {market.outcomes.map((outcome, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedIndex(idx)}
                className={`flex-1 py-3 text-xs font-black rounded-xl transition-all duration-300 ${
                  selectedIndex === idx
                    ? 'bg-gradient-to-br from-emerald-500 via-emerald-500 to-emerald-600 text-white shadow-xl shadow-emerald-500/30 scale-105'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/8 hover:scale-100'
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{outcome.position}</span>
                  {selectedIndex === idx && <TrendingUp className="w-3 h-3" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Enhanced Stats Card */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-white/5 to-purple-500/10 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-emerald-500/20">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <p className="text-[8px] text-emerald-400/70 uppercase tracking-wider font-black">Multiplier</p>
              </div>
              <p className="font-heading font-black text-emerald-400 text-lg">{activeOutcome.odds.toFixed(2)}x</p>
            </div>
            <div className="text-center border-x border-white/10">
              <p className="text-[8px] text-white/50 uppercase tracking-wider font-black mb-1">Pool</p>
              <p className="font-heading font-black text-white text-lg">◎{activeOutcome.pool?.toFixed(2) || '0'}</p>
            </div>
            <div className="text-center">
              <p className="text-[8px] text-white/50 uppercase tracking-wider font-black mb-1">Active LPs</p>
              <p className="font-heading font-black text-amber-400 text-lg">{activeOutcome.lp_offers || 0}</p>
            </div>
          </div>
        </div>

        {/* FOMO Banner - High Energy */}
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-emerald-500/15 border border-emerald-500/30 rounded-xl p-3 mb-4">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 blur-2xl" />
          <div className="relative">
            <p className="text-[10px] text-emerald-300 leading-relaxed">
              <span className="font-black text-emerald-400">UNDERWRITE</span> {market.country} finishing <span className="font-black text-emerald-400">{activeOutcome.position.toLowerCase()}</span>
            </p>
            <p className="text-[9px] text-emerald-400/70 mt-1">
              💰 Keep your stake + win losers' money if they DON'T reach it!
            </p>
          </div>
        </div>

        {/* Investment Section */}
        <div className="mt-auto space-y-3">
          <div>
            <label className="text-[9px] text-white/60 uppercase tracking-wider font-bold mb-1.5 block">Investment Amount (SOL)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-lg">◎</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-gradient-to-br from-white/8 to-white/3 border border-emerald-500/30 text-white font-heading font-black text-2xl h-16 rounded-2xl pl-10 pr-4 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-white/20"
              />
            </div>
          </div>
          
          {/* Quick Amount Buttons */}
          <div className="flex gap-2">
            {[0.5, 1, 5, 10].map(qa => (
              <button
                key={qa}
                onClick={() => setAmount(String(qa))}
                className="px-3 py-3 text-xs font-black bg-gradient-to-br from-emerald-500/15 to-emerald-500/10 hover:from-emerald-500/25 hover:to-emerald-500/15 border border-emerald-500/20 rounded-xl flex-1 transition-all text-emerald-300 hover:text-emerald-200 hover:scale-105 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/20"
              >
                ◎{qa}
              </button>
            ))}
          </div>

          {/* Potential Return Display */}
          {amount && parseFloat(amount) > 0 && activeOutcome.odds > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border border-amber-500/30 rounded-xl p-3"
            >
              <p className="text-[9px] text-amber-400/70 uppercase tracking-wider font-bold mb-0.5">Potential Return</p>
              <p className="font-heading font-black text-amber-400 text-xl">◎{potentialReturn} SOL</p>
            </motion.div>
          )}

          {/* CTA Button - High Impact */}
          <Button
            onClick={() => {
              onProvideLiquidity({
                ...activeOutcome,
                market_id: market.id,
              }, parseFloat(amount));
            }}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full h-14 font-heading font-black rounded-2xl text-base transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
            style={{ 
              background: 'linear-gradient(135deg, #21c45d 0%, #10b981 50%, #059669 100%)',
              boxShadow: '0 6px 24px rgba(33,196,93,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
              textShadow: '0 1px 2px rgba(0,0,0,0.2)'
            }}
          >
            <DollarSign className="w-5 h-5 mr-2 inline" />
            Provide ◎{amount || '0'} Liquidity
          </Button>
        </div>
      </div>
    </motion.div>
  );
}