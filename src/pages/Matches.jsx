import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Trophy, Search, Globe, ChevronDown, ChevronUp, Rocket, Loader } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import MatchCard from '@/components/betting/MatchCard';
import { motion } from 'framer-motion';
import GroupNavigation, { WORLD_CUP_GROUPS_2026 } from '@/components/futures/GroupNavigation';

export default function Matches() {
  const [activeGroup, setActiveGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [highlightedMatchId, setHighlightedMatchId] = useState(null);
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
      const res = await base44.functions.invoke('deployAllMatches');
      alert(res.data.message || '✓ All matches deployed successfully!');
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['bets'] });
    } catch (err) {
      alert('Error deploying matches: ' + err.message);
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle deep link from featured matches
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const matchId = urlParams.get('match');
    if (matchId) {
      setHighlightedMatchId(matchId);
      // Remove the param from URL after reading
      window.history.replaceState({}, '', window.location.pathname);
      // Scroll to the match after a short delay
      setTimeout(() => {
        const element = document.getElementById(`match-${matchId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, []);

  const { data: rawMatches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list('match_time', 100),
  });

  // Deduplicate matches by unique game properties (team_a, team_b, match_time)
  const seenMatches = new Set();
  const matches = rawMatches.filter(m => {
    const matchKey = `${m.team_a?.toLowerCase?.() || ''}|${m.team_b?.toLowerCase?.() || ''}|${m.match_time || ''}`;
    if (seenMatches.has(matchKey)) return false;
    seenMatches.add(matchKey);
    return true;
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['bets'],
    queryFn: () => base44.entities.Bet.filter({}),
  });

  const betByMatch = {};
  bets.forEach(b => { betByMatch[b.match_id] = b; });

  // Filter by active group using WORLD_CUP_GROUPS_2026
  const filtered = React.useMemo(() => {
    if (activeGroup === 'ALL') {
      return matches;
    }
    
    const groupTeams = WORLD_CUP_GROUPS_2026[activeGroup]?.map(t => t.name) || [];
    return matches.filter(m => 
      groupTeams.includes(m.team_a) || groupTeams.includes(m.team_b)
    );
  }, [matches, activeGroup]);

  // Filter by search query
  const searchFiltered = search
    ? filtered.filter(m => {
        const q = search.toLowerCase();
        return m.team_a?.toLowerCase().includes(q) || m.team_b?.toLowerCase().includes(q);
      })
    : filtered;

  // Filter by date (up to June 27, 2026)
  const cutoffDate = new Date('2026-06-27T23:59:59Z');
  const finalFiltered = searchFiltered.filter(m => {
    if (m.match_time && new Date(m.match_time) > cutoffDate) return false;
    return true;
  });

  // Sort filtered matches by date
  const sortedMatches = [...finalFiltered].sort((a, b) => {
    if (!a.match_time) return 1;
    if (!b.match_time) return -1;
    return new Date(a.match_time) - new Date(b.match_time);
  });

  // Group matches by date within the active group
  const groupedByDate = {};
  sortedMatches.forEach(m => {
    const dateKey = m.match_time ? format(new Date(m.match_time), 'yyyy-MM-dd') : 'TBD';
    const dateLabel = m.match_time ? format(new Date(m.match_time), 'EEEE, MMM d · yyyy') : 'TBD';
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = { label: dateLabel, matches: [] };
    groupedByDate[dateKey].matches.push(m);
  });

  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
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
                className="hidden sm:flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                {isDeploying ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                Deploy All Matches
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
            Match Schedule
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mb-4">
            Browse all matches from the group stage to the final. Search by team, filter by group, and bet on every match.
          </p>

          {/* How Match Betting Works - Expandable on mobile */}
          <div className={`overflow-hidden transition-all duration-300 ${isInfoExpanded ? 'max-h-[800px]' : 'max-h-[0px]'} sm:max-h-none`}>
            <div className="border-t border-border/50 pt-4">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full text-primary text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mb-3">
                ⚽ How Match Betting Works
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
            placeholder="Search teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 sm:pl-10 bg-card border-border/50 h-10 sm:h-11 rounded-xl text-xs sm:text-sm"
          />
        </div>

        {/* Quick-Jump Group Navigation */}
        <GroupNavigation 
          onGroupClick={(groupName) => {
            setActiveGroup(groupName);
            if (groupName !== 'ALL') {
              const firstMatch = sortedMatches.find(m => 
                WORLD_CUP_GROUPS_2026[groupName]?.some(t => t.name === m.team_a || t.name === m.team_b)
              );
              if (firstMatch) {
                setTimeout(() => {
                  const element = document.getElementById(`group-${groupName}`);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }
            }
          }} 
          activeGroup={activeGroup} 
        />
      </motion.div>

      {sortedMatches.length > 0 ? (
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
                  {sortedMatches.length} matches
                </p>
              </div>
            </div>

            <div className="space-y-6 sm:space-y-8">
              {sortedDates.map((dateKey, dateIndex) => {
                const { label, matches: dateMatches } = groupedByDate[dateKey];
                return (
                  <motion.div
                    key={dateKey}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: dateIndex * 0.05, duration: 0.4 }}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-5">
                      <div className="flex items-center gap-2 sm:gap-2.5 bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2">
                        <span className="font-heading font-bold text-xs sm:text-sm text-primary">{label}</span>
                      </div>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {dateMatches.map((m, i) => (
                        <div
                          key={m.id}
                          id={`match-${m.id}`}
                          className={m.id === highlightedMatchId ? 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl' : ''}
                        >
                          <MatchCard 
                            match={m} 
                            bet={betByMatch[m.id]} 
                            index={i}
                            onOddsRefresh={() => {
                              queryClient.invalidateQueries({ queryKey: ['bets'] });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ) : (
          /* All Groups View */
          <div className="space-y-6 sm:space-y-8">
            {sortedDates.map((dateKey, dateIndex) => {
              const { label, matches: dateMatches } = groupedByDate[dateKey];
              return (
                <motion.div
                  key={dateKey}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dateIndex * 0.05, duration: 0.4 }}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-5 sticky top-14 sm:top-16 z-10 bg-background/95 backdrop-blur-sm py-2 sm:py-3">
                    <div className="flex items-center gap-2 sm:gap-2.5 bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg">
                      <span className="font-heading font-bold text-xs sm:text-base text-primary">{label}</span>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-border/50 to-transparent" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {dateMatches.map((m, i) => (
                      <div
                        key={m.id}
                        id={`match-${m.id}`}
                        className={m.id === highlightedMatchId ? 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl' : ''}
                      >
                        <MatchCard 
                          match={m} 
                          bet={betByMatch[m.id]} 
                          index={i}
                          onOddsRefresh={() => {
                            queryClient.invalidateQueries({ queryKey: ['bets'] });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
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
          <p className="text-muted-foreground text-sm">No matches found</p>
        </motion.div>
      )}
    </div>
  );
}