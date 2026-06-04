import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, TrendingUp, Clock, ChevronRight, Lock, Trophy, Calendar, Loader, RefreshCcw, Sparkles, Globe, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GroupCountryCard from '@/components/futures/GroupCountryCard';
import GroupNavigation, { WORLD_CUP_GROUPS_2026 } from '@/components/futures/GroupNavigation';
import FuturesBetSlip from '@/components/futures/FuturesBetSlip';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function Futures() {
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [activeTab, setActiveTab] = useState('futures');
  const [activeGroup, setActiveGroup] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const groupRefs = useRef({});

  // Fetch futures markets from database
  const { data: futuresMarkets = [], isLoading } = useQuery({
    queryKey: ['futures-markets'],
    queryFn: async () => {
      const markets = await base44.entities.FuturesMarket.list();
      return markets;
    },
  });

  // Filter markets by selected group
  const filteredMarketsByGroup = React.useMemo(() => {
    if (activeGroup === 'ALL') {
      return futuresMarkets;
    }
    
    const groupTeams = WORLD_CUP_GROUPS_2026[activeGroup]?.map(t => t.name) || [];
    return futuresMarkets.filter(m => m.country && groupTeams.includes(m.country));
  }, [futuresMarkets, activeGroup]);

  // Scroll to group section
  const scrollToGroup = (groupName) => {
    setActiveGroup(groupName);
    const element = document.getElementById(`group-${groupName}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Handle country selection
  const handleCountrySelect = (market, outcome) => {
    setSelectedMarket(market);
    setSelectedOutcome(outcome);
    setShowBetSlip(true);
    console.log('Selected:', market.country, outcome.position, outcome.odds);
  };

  // Handle bet confirmation - initiates on-chain transaction
  const handleBetConfirm = async ({ market, outcome, amount, potentialPayout, walletAddress, prepareOnly, commitOnly, signature, commit_data }) => {
    console.log('[Futures] handleBetConfirm called with:', {
      marketId: market?.id,
      outcome,
      amount,
      walletAddress,
      prepareOnly,
      commitOnly,
      signature,
    });
    
    try {
      // Get wallet address from localStorage if not provided
      if (!walletAddress) {
        const walletSession = localStorage.getItem('elevenx_wallet_session');
        walletAddress = walletSession ? JSON.parse(walletSession).address : null;
      }
      
      if (!walletAddress) {
        alert('Please connect your Phantom wallet first');
        return;
      }

      // Call backend to get Solana transaction instructions
      const res = await base44.functions.invoke('placeFuturesBet', {
        walletAddress,
        marketId: market?.id,
        outcome,
        amount,
      });

      if (res.data.error) {
        const err = new Error(res.data.error);
        err.marketId = res.data.marketId;
        err.country = res.data.country;
        throw err;
      }

      // Store commit data for after transaction succeeds
      window.pendingFuturesCommit = {
        commit_data: res.data.commit_data,
        marketId: market.id,
        betAmount: amount,
      };

      // Set instruction for SolanaTransactionSigner
      setSelectedMarket({
        ...market,
        solana_instruction: res.data.solana_instruction,
        commit_data: res.data.commit_data,
        betAmount: amount,
      });
      
    } catch (error) {
      console.error('Failed to prepare bet:', error);
      const errorMsg = error.message || 'Unknown error';
      const country = error.country || 'this country';
      
      if (errorMsg.includes('not deployed on-chain') || errorMsg.includes('Admin must deploy')) {
        alert(`⚠️ ${country} market is not deployed on-chain yet.\n\nGo to Admin panel → Futures tab → Click "Deploy" on ${country}.\n\nOnce deployed, you can place bets with your Phantom wallet.`);
      } else {
        alert('Failed to prepare bet: ' + errorMsg);
      }
    }
  };

  // Handle Solana transaction success
  const handleTransactionSuccess = async (result) => {
    try {
      console.log('Transaction confirmed:', result);
      
      const pendingCommit = window.pendingFuturesCommit;
      if (pendingCommit && result.signature) {
        // Call commit function to update database
        const res = await base44.functions.invoke('commitFuturesBet', {
          signature: result.signature,
          commit_data: pendingCommit.commit_data,
        });

        if (res.data.error) {
          throw new Error(res.data.error);
        }

        console.log('Bet committed to database:', res.data.userBetId);
        
        // Clean up
        window.pendingFuturesCommit = null;
        setShowBetSlip(false);
        setSelectedMarket(null);
        setSelectedOutcome(null);
        
        // Show success
        alert(`✓ Bet placed successfully!\n\nTransaction: ${result.signature.slice(0, 8)}...${result.signature.slice(-8)}\n\nView on Solscan: https://solscan.io/tx/${result.signature}?cluster=devnet`);
        
        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['futures-markets'] });
        queryClient.invalidateQueries({ queryKey: ['user-bets'] });
      }
    } catch (error) {
      console.error('Failed to commit bet:', error);
      alert('Transaction succeeded but failed to update database: ' + error.message);
    }
  };

  // Also handle commit from SolanaTransactionSigner directly
  const commitFuturesBetMutation = useMutation({
    mutationFn: async ({ signature, commitData }) => {
      const res = await base44.functions.invoke('commitFuturesBet', {
        signature,
        commit_data: commitData,
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      window.pendingFuturesCommit = null;
      setShowBetSlip(false);
      setSelectedMarket(null);
      setSelectedOutcome(null);
      queryClient.invalidateQueries({ queryKey: ['futures-markets'] });
      queryClient.invalidateQueries({ queryKey: ['user-bets'] });
    },
  });

  // Mutation to fetch and calculate odds
  const fetchOddsMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('fetchAndCalculateOdds', {});
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['futures-markets'] });
    },
  });

  // Filter markets by search query first, then by group
  const searchFilteredMarkets = searchQuery
    ? futuresMarkets.filter(m => 
        m.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : futuresMarkets;
  
  // Then filter by group
  const filteredMarkets = activeGroup === 'ALL' 
    ? searchFilteredMarkets 
    : searchFilteredMarkets.filter(m => {
        const groupTeams = WORLD_CUP_GROUPS_2026[activeGroup]?.map(t => t.name) || [];
        return m.country && groupTeams.includes(m.country);
      });

  // Auto-scroll to first matching group when search query changes
  React.useEffect(() => {
    if (searchQuery && filteredMarkets.length > 0) {
      const firstMatch = filteredMarkets[0];
      if (firstMatch?.country) {
        // Find which group this country belongs to
        const matchingGroup = Object.entries(WORLD_CUP_GROUPS_2026).find(([_, teams]) =>
          teams.some(t => t.name === firstMatch.country)
        );
        if (matchingGroup) {
          const groupName = matchingGroup[0];
          setTimeout(() => {
            const element = document.getElementById(`group-${groupName}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        }
      }
    }
  }, [searchQuery]);

  const openMarkets = filteredMarkets.filter((m) => m.status === 'open');
  const comingMarkets = filteredMarkets.filter((m) => m.status === 'coming_soon');

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
                <Globe className="w-5 h-5 text-orange-400" />
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">World Cup 2026</span>
                <Badge className="ml-auto text-[10px] bg-primary/20 text-primary border border-primary/30">Official Groups</Badge>
              </div>

              <div className="flex items-center justify-between mb-2">
                <h1 className="font-heading font-black text-3xl text-white">Tournament Futures</h1>
                <Button
                  size="sm"
                  onClick={() => fetchOddsMutation.mutate()}
                  disabled={fetchOddsMutation.isPending}
                  className="bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 text-xs font-bold"
                >
                  {fetchOddsMutation.isPending ? (
                    <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Update Odds
                </Button>
              </div>
              <p className="text-white/50 text-sm max-w-md">
                All 48 teams across 12 groups. Bet on 1st, 2nd, or 3rd place finishes with live multipliers.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-5">
                <div>
                  <p className="text-white font-heading font-bold text-xl">12</p>
                  <p className="text-white/40 text-[10px]">Groups (A-L)</p>
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

          {/* How Futures Work Banner */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-r from-[#1a1040]/80 via-[#0f0a1e]/90 to-[#12102a]/80 border border-primary/20 rounded-2xl p-6 relative overflow-hidden mb-6"
          >
            {/* Decorative Glow Orbs */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl opacity-25 bg-[#a69cf2]" />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full blur-2xl opacity-15 bg-[#14f195]" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-3 py-1 rounded-full text-primary text-[10px] font-bold tracking-widest uppercase">
                  🏆 Futures Betting
                </div>
                <h2 className="font-heading font-black text-lg md:text-xl text-white">Bet on Tournament Outcomes</h2>
                <p className="text-xs text-white/70 leading-relaxed">
                  Back any team to finish 1st, 2nd, or 3rd in their group. Odds are locked when you bet — if your team finishes in that position, you get paid out based on the multiplier!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10 relative z-10">
              <div className="space-y-1.5">
                <span className="text-xl">💡</span>
                <h3 className="font-heading font-bold text-xs text-primary">How It Works</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong>Bets require LP liquidity.</strong> LPs deposit SOL to cover potential payouts. When you bet, your stake goes into the pool. Winners share the pool after the tournament ends.
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xl">👑</span>
                <h3 className="font-heading font-bold text-xs text-accent">Be the House (LP)</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Provide liquidity for outcomes you think WON'T happen. Earn <strong>2% fees</strong> on matched bets plus keep losing bettors' stakes. Withdraw unmatched funds anytime!
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xl">⚠️</span>
                <h3 className="font-heading font-bold text-xs text-yellow-400">Important</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  You can only bet if there's enough LP liquidity. <strong>No LP = no betting.</strong> LPs earn fees on every bet and keep losing stakes as profit!
                </p>
              </div>
            </div>
          </motion.div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search country (e.g. Brazil, Argentina)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border/50 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
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
                const element = document.getElementById(`group-${groupName}`);
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
            <section id={`group-${activeGroup}`} className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
                  <span className="font-heading font-black text-lg text-primary">{activeGroup}</span>
                </div>
                <div>
                  <h2 className="font-heading font-bold text-base text-foreground">Group {activeGroup}</h2>
                  <p className="text-xs text-muted-foreground">
                    {filteredMarkets.length > 0 ? `${filteredMarkets.length} teams with active markets` : 'Markets coming soon'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {filteredMarkets.length > 0 ? (
                  filteredMarkets.map((market, index) => (
                    <GroupCountryCard
                      key={market.id}
                      market={market}
                      onSelect={handleCountrySelect}
                    />
                  ))
                ) : (
                  WORLD_CUP_GROUPS_2026[activeGroup].map((team, index) => (
                    <motion.div
                      key={team.name}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="bg-card/40 border border-border/20 rounded-2xl p-4 opacity-50"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-secondary/30 border-2 border-border/30 flex items-center justify-center text-2xl grayscale">
                          {team.flag}
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-sm text-muted-foreground">{team.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Coming Soon</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((pos) => (
                          <div key={pos} className="rounded-xl p-2.5 border border-border/20 bg-secondary/10 opacity-40">
                            <div className="text-center">
                              <div className="text-[9px] mb-1 text-muted-foreground">
                                {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'} {pos}{pos === 1 ? 'st' : pos === 2 ? 'nd' : 'rd'}
                              </div>
                              <div className="font-heading font-black text-xs text-muted-foreground">--</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </section>
          ) : (
            /* All Groups View */
            Object.entries(WORLD_CUP_GROUPS_2026).map(([groupName, teams]) => {
              const groupMarkets = filteredMarkets.filter(m => 
                m.country && teams.some(t => t.name === m.country)
              );
              const hasMarkets = groupMarkets.length > 0;

              return (
                <section key={groupName} id={`group-${groupName}`} className="scroll-mt-24">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
                      <span className="font-heading font-black text-lg text-primary">{groupName}</span>
                    </div>
                    <div>
                      <h2 className="font-heading font-bold text-base text-foreground">Group {groupName}</h2>
                      <p className="text-xs text-muted-foreground">
                        {hasMarkets ? `${groupMarkets.length} teams with active markets` : 'Markets coming soon'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {hasMarkets ? (
                      groupMarkets.map((market, index) => (
                        <GroupCountryCard
                          key={market.id}
                          market={market}
                          onSelect={handleCountrySelect}
                        />
                      ))
                    ) : (
                      teams.map((team, index) => (
                        <motion.div
                          key={team.name}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.03 }}
                          className="bg-card/40 border border-border/20 rounded-2xl p-4 opacity-50"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-12 h-12 rounded-full bg-secondary/30 border-2 border-border/30 flex items-center justify-center text-2xl grayscale">
                              {team.flag}
                            </div>
                            <div>
                              <h3 className="font-heading font-bold text-sm text-muted-foreground">{team.name}</h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                                <span className="text-[9px] text-muted-foreground">Coming Soon</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[1, 2, 3].map((pos) => (
                              <div key={pos} className="rounded-xl p-2.5 border border-border/20 bg-secondary/10 opacity-40">
                                <div className="text-center">
                                  <div className="text-[9px] mb-1 text-muted-foreground">
                                    {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'} {pos}{pos === 1 ? 'st' : pos === 2 ? 'nd' : 'rd'}
                                  </div>
                                  <div className="font-heading font-black text-xs text-muted-foreground">--</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </section>
              );
            })
          )}



          {/* Info banner - country markets status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-heading font-bold text-sm text-foreground mb-1">Country Markets Status</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {futuresMarkets.filter(m => m.country).length} country markets active. 
                  Tournament markets shown above. Create individual country markets from Admin to unlock all 48 teams.
                </p>
                <Button
                  onClick={() => window.location.href = '/admin'}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-xs font-bold h-9"
                >
                  Create Country Markets →
                </Button>
              </div>
            </div>
          </motion.div>

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

          {/* Bet Slip Modal */}
          <AnimatePresence>
            {showBetSlip && selectedMarket && selectedOutcome && (
              <FuturesBetSlip
                market={selectedMarket}
                outcome={selectedOutcome}
                onClose={() => {
                  setShowBetSlip(false);
                  setSelectedMarket(null);
                  setSelectedOutcome(null);
                }}
                onConfirm={handleBetConfirm}
              />
            )}
          </AnimatePresence>

          {/* Solana Transaction Signer Modal (when market has instruction) */}
          {selectedMarket?.solana_instruction && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-md w-full">
                <div className="space-y-4">
                  <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                    <p className="text-sm font-bold text-primary mb-1">Sign Solana Transaction</p>
                    <p className="text-xs text-muted-foreground">
                      Betting on {selectedMarket.country} - {selectedOutcome?.position} Place
                    </p>
                  </div>
                  <SolanaTransactionSigner
                    instruction={selectedMarket.solana_instruction}
                    amount={selectedOutcome?.odds ? (selectedMarket.betAmount || 0) : 0}
                    onSuccess={handleTransactionSuccess}
                    onError={(err) => {
                      console.error('Transaction failed:', err);
                      alert('Transaction failed: ' + (err.message || 'Unknown error'));
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedMarket(null);
                      setSelectedOutcome(null);
                      setShowBetSlip(false);
                    }}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
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