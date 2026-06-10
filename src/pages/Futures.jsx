import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Loader, Search, Globe, ChevronDown, ChevronUp, Rocket } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GroupNavigation, { WORLD_CUP_GROUPS_2026 } from '@/components/futures/GroupNavigation';
import FuturesBetSlip from '@/components/futures/FuturesBetSlip';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import FuturesCard from '@/components/futures/FuturesCard';

export default function Futures() {
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [activeGroup, setActiveGroup] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const queryClient = useQueryClient();

  // Check if user is admin
  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, []);

  const handleDeployAll = async () => {
    setIsDeploying(true);
    try {
      const res = await base44.functions.invoke('deployAllFutures');
      alert(res.data.message || '✓ All futures deployed successfully!');
      queryClient.invalidateQueries({ queryKey: ['futures-markets'] });
    } catch (err) {
      alert('Error deploying futures: ' + err.message);
    } finally {
      setIsDeploying(false);
    }
  };

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
    // Show markets for this group: country matches group name (e.g., "Group A") OR team names
    return futuresMarkets.filter(m => {
      if (m.country === activeGroup) return true; // Group winner markets
      if (groupTeams.includes(m.country)) return true; // Team-specific markets
      return false;
    });
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
        // Show markets for this group (e.g., "Group A") OR team names OR test markets
        return m.country === activeGroup || m.country === 'Test' || groupTeams.includes(m.country);
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

  // Separate test markets from real markets
  const testMarkets = futuresMarkets.filter(m => m.title?.includes('Quick Test') || m.title?.includes('Future Test'));
  const openMarkets = filteredMarkets.filter((m) => m.status === 'open' && !m.title?.includes('Quick Test') && !m.title?.includes('Future Test'));
  const comingMarkets = filteredMarkets.filter((m) => m.status === 'coming_soon' && !m.title?.includes('Quick Test') && !m.title?.includes('Future Test'));
  
  // Group markets by actual group (Group A, B, C, etc.) for ALL view
  const marketsByGroup = React.useMemo(() => {
    const grouped = {};
    openMarkets.forEach(m => {
      const groupName = m.country; // e.g., "Group A"
      if (groupName && groupName.startsWith('Group ')) {
        if (!grouped[groupName]) grouped[groupName] = [];
        grouped[groupName].push(m);
      }
    });
    return grouped;
  }, [openMarkets]);
  
  // Debug: Log markets count
  React.useEffect(() => {
    console.log('[Futures] Total markets:', futuresMarkets.length);
    console.log('[Futures] Open markets:', openMarkets.length);
    console.log('[Futures] Markets by group:', marketsByGroup);
    console.log('[Futures] First 3 markets:', futuresMarkets.slice(0, 3).map(m => ({ country: m.country, status: m.status, title: m.title })));
  }, [futuresMarkets, openMarkets, marketsByGroup]);

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
    <div className="space-y-6">
      {/* Hero Section - Full Width like Matches */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border/50 bg-card"
      >
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                <Trophy className="w-3 h-3 text-primary" />
                <span className="text-[9px] sm:text-[10px] font-bold text-primary tracking-widest">WORLD CUP 2026</span>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={handleDeployAll}
                disabled={isDeploying}
                className="hidden sm:flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-600/50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                {isDeploying ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                Deploy All Futures
              </button>
            )}
            {/* Mobile Expand/Collapse Button */}
            <button
              onClick={() => setIsInfoExpanded(!isInfoExpanded)}
              className="sm:hidden flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              {isInfoExpanded ? (
                <>
                  <span>Hide</span>
                  <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  <span>Info</span>
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
          <h1 className="font-heading font-black text-xl sm:text-2xl md:text-3xl leading-tight mb-2">
            Tournament Futures
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mb-4">
            All 48 teams across 12 groups. Bet on 1st, 2nd, or 3rd place finishes with live multipliers.
          </p>

          {/* How Futures Betting Works - Expandable on mobile */}
          <div className={`overflow-hidden transition-all duration-300 ${isInfoExpanded ? 'max-h-[800px]' : 'max-h-[0px]'} sm:max-h-none`}>
            <div className="border-t border-border/50 pt-4">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full text-primary text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-3">
                🏆 How Futures Betting Works
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <span className="text-lg sm:text-xl">💡</span>
                  <h3 className="font-heading font-bold text-[11px] sm:text-xs text-primary">How It Works</h3>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    LPs deposit SOL first to create liquidity pools. When you bet, your stake is <strong>instantly matched</strong> against available LP funds and <strong>locked in</strong> with fixed odds.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-lg sm:text-xl">👑</span>
                  <h3 className="font-heading font-bold text-[11px] sm:text-xs text-accent">Be the House (LP)</h3>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    Provide liquidity for outcomes you think WON'T happen. Earn <strong>2% fees</strong> on matched bets plus keep losing bettors' stakes! <strong>Withdraw unmatched funds anytime</strong> — only locked once matched.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-lg sm:text-xl">⚠️</span>
                  <h3 className="font-heading font-bold text-[11px] sm:text-xs text-yellow-400">Important</h3>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
                    <strong>No LP liquidity = no bets possible.</strong> Bettors can only bet when LPs have provided liquidity. Once matched, bets are <strong>locked in</strong> with fixed odds. <strong>Instant claims</strong> — no on-chain delays.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Search & Group Filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
          <Input
            placeholder="Search countries..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 sm:pl-10 bg-card border-border/50 h-10 sm:h-11 rounded-xl text-xs sm:text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <span className="text-[10px] sm:text-xs font-bold">Clear</span>
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
      </motion.div>

      {/* Test Markets Section (always at top when ALL groups selected) */}
      {activeGroup === 'ALL' && testMarkets.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-600/20 to-emerald-400/10 border border-emerald-600/30 flex items-center justify-center">
              <span className="font-heading font-black text-base sm:text-lg text-emerald-400">TEST</span>
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm sm:text-base text-foreground">Quick Test Markets</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {testMarkets.length} test market{testMarkets.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {testMarkets.map((m, i) => (
              <FuturesCard key={m.id} market={m} index={i} onSelect={handleCountrySelect} />
            ))}
          </div>
        </section>
      )}
      
      {/* Regular Futures Markets - Show ALL markets (open + coming_soon) grouped by group */}
      {futuresMarkets.length > 0 ? (
        activeGroup !== 'ALL' ? (
          /* Single Group View */
          <section id={`group-${activeGroup}`} className="scroll-mt-20 sm:scroll-mt-24">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
                <span className="font-heading font-black text-base sm:text-lg text-primary">{activeGroup}</span>
              </div>
              <div>
                <h2 className="font-heading font-bold text-sm sm:text-base text-foreground">Group {activeGroup}</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {filteredMarketsByGroup.length} markets
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMarketsByGroup.map((m, i) => (
                <FuturesCard
                  key={m.id}
                  market={m}
                  index={i}
                  onSelect={handleCountrySelect}
                />
              ))}
            </div>
          </section>
        ) : (
          /* All Groups View - Group ALL markets by their actual group */
          <div className="space-y-6 sm:space-y-8">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((letter) => {
              const groupName = `Group ${letter}`;
              const groupMarkets = futuresMarkets.filter(m => m.country === groupName);
              if (groupMarkets.length === 0) return null;
              
              return (
                <section key={groupName} id={`group-${groupName}`} className="scroll-mt-20 sm:scroll-mt-24">
                  <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30 flex items-center justify-center">
                      <span className="font-heading font-black text-base sm:text-lg text-primary">{letter}</span>
                    </div>
                    <div>
                      <h2 className="font-heading font-bold text-sm sm:text-base text-foreground">{groupName}</h2>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {groupMarkets.length} markets
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupMarkets.map((market, index) => (
                      <FuturesCard
                        key={market.id}
                        market={market}
                        index={index}
                        onSelect={handleCountrySelect}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20 bg-card border border-border/50 rounded-3xl"
        >
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">No markets found</p>
        </motion.div>
      )}





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

    </div>
  );
}