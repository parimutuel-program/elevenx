import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, DollarSign, Clock, Globe, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GroupNavigation, { WORLD_CUP_GROUPS_2026 } from '@/components/futures/GroupNavigation';
import { Input } from '@/components/ui/input';

export default function FuturesLpPanel({ 
  futuresMarkets, 
  onProvideLiquidity, 
  isConnected,
  connect 
}) {
  const [selectedOutcome, setSelectedOutcome] = React.useState(null);
  const [activeGroup, setActiveGroup] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Flatten all country outcomes from all markets
  const allOutcomes = React.useMemo(() => {
    const outcomes = [];
    futuresMarkets.forEach(market => {
      if ((market.status === 'open' || market.status === 'coming_soon') && market.country) {
        market.outcomes.forEach(outcome => {
          outcomes.push({
            ...outcome,
            market_id: market.id,
            market_title: market.title,
            market_category: market.category,
            market_icon: market.icon,
            open_until: market.open_until,
            country: market.country,
            country_flag: market.country_flag,
          });
        });
      }
    });
    return outcomes;
  }, [futuresMarkets]);

  // Filter by search query
  const filteredOutcomes = searchQuery
    ? allOutcomes.filter(o => 
        o.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.label?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allOutcomes;

  // Group outcomes by World Cup groups
  const outcomesByGroup = useMemo(() => {
    const grouped = {};
    Object.keys(WORLD_CUP_GROUPS_2026).forEach(groupName => {
      const groupTeams = WORLD_CUP_GROUPS_2026[groupName].map(t => t.name);
      grouped[groupName] = filteredOutcomes.filter(o => groupTeams.includes(o.country));
    });
    return grouped;
  }, [filteredOutcomes]);

  // Filter outcomes by active group
  const displayedOutcomes = activeGroup === 'ALL' 
    ? filteredOutcomes 
    : (outcomesByGroup[activeGroup] || []);

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

      {/* Single Group View or All Groups View */}
      {activeGroup !== 'ALL' ? (
        /* Single Group View */
        <section id={`lp-group-${activeGroup}`} className="scroll-mt-24">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
              <span className="font-heading font-black text-lg text-primary">{activeGroup}</span>
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-foreground">Group {activeGroup}</h2>
              <p className="text-xs text-muted-foreground">{displayedOutcomes.length} countries with LP markets</p>
            </div>
          </div>

          {displayedOutcomes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedOutcomes.map((outcome, i) => (
                <FuturesOutcomeCard
                  key={`${outcome.market_id}-${outcome.label}`}
                  outcome={outcome}
                  selectedOutcome={selectedOutcome}
                  setSelectedOutcome={setSelectedOutcome}
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
        /* All Groups View */
        Object.entries(WORLD_CUP_GROUPS_2026).map(([groupName, teams]) => {
          const groupOutcomes = outcomesByGroup[groupName] || [];
          if (groupOutcomes.length === 0) return null;

          return (
            <section key={groupName} id={`lp-group-${groupName}`} className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
                  <span className="font-heading font-black text-lg text-primary">{groupName}</span>
                </div>
                <div>
                  <h2 className="font-heading font-bold text-base text-foreground">Group {groupName}</h2>
                  <p className="text-xs text-muted-foreground">{groupOutcomes.length} countries with LP markets</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {groupOutcomes.map((outcome, i) => (
                  <FuturesOutcomeCard
                    key={`${outcome.market_id}-${outcome.label}`}
                    outcome={outcome}
                    selectedOutcome={selectedOutcome}
                    setSelectedOutcome={setSelectedOutcome}
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

function FuturesOutcomeCard({ outcome, selectedOutcome, setSelectedOutcome, onProvideLiquidity }) {
  const [amount, setAmount] = React.useState('');
  const isSelected = selectedOutcome?.label === outcome.label && selectedOutcome?.market_id === outcome.market_id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 overflow-hidden transition-all ${
        isSelected ? 'border-primary bg-primary/5' : 'border-border/50 bg-card hover:border-border'
      }`}
    >
      {/* Card Header with Flag, Country Name, and Odds */}
      <div className="p-5 border-b border-border/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-5xl shrink-0">{outcome.country_flag || outcome.flag || '🌍'}</div>
          <div className="flex-1">
            <h3 className="font-heading font-black text-xl text-foreground">{outcome.country}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{outcome.label}</p>
          </div>
          <Badge className={`${outcome.odds >= 5 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-primary/20 text-primary border-primary/30'} border text-base font-bold px-3 py-1`}>
            {outcome.odds.toFixed(1)}x
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{outcome.market_title}</p>
      </div>

      {/* LP Provider Section */}
      <div className="p-5 space-y-4">
        {/* Explainer */}
        <div className="bg-secondary/40 rounded-xl p-3.5 text-xs">
          <p className="font-bold text-foreground mb-1.5">💰 Be The House</p>
          <p className="text-muted-foreground">
            Provide liquidity <span className="text-destructive font-bold">AGAINST</span> {outcome.label}.
          </p>
          <p className="text-muted-foreground mt-1.5">
            If they <span className="text-green-400 font-bold">LOSE</span> → You profit.
            If they <span className="text-destructive font-bold">WIN</span> → You pay {outcome.odds.toFixed(1)}x.
          </p>
        </div>

        {/* Amount Input */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-bold">LP Amount (SOL)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-secondary/50 border-border/50 text-xl font-heading font-bold h-12 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2 mt-2.5">
            {[0.5, 1, 5, 10].map(qa => (
              <button
                key={qa}
                onClick={() => setAmount(String(qa))}
                className="px-3 py-2 text-sm font-bold bg-secondary hover:bg-secondary/80 rounded-lg flex-1 transition-colors"
              >
                ◎{qa}
              </button>
            ))}
          </div>
        </div>

        {/* Provide LP Button */}
        <Button
          onClick={() => onProvideLiquidity(outcome, parseFloat(amount))}
          disabled={!amount || parseFloat(amount) <= 0}
          className="w-full h-12 font-heading font-bold rounded-xl text-base"
          style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}
        >
          <DollarSign className="w-5 h-5 mr-2" />
          Provide ◎{amount || '0'} LP
        </Button>

        {/* Reset amount after clicking */}
        {amount > 0 && (
          <button
            onClick={() => setAmount('')}
            className="text-xs text-muted-foreground hover:text-foreground mt-2 font-medium"
          >
            Clear
          </button>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/30">
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Pool</p>
            <p className="font-heading font-black text-sm text-foreground">◎{outcome.pool?.toFixed(2) || '0'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">LP Offers</p>
            <p className="font-heading font-black text-sm text-foreground">{outcome.lp_offers || 0}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}