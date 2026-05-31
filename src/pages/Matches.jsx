import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Trophy, Search, Calendar, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import MatchCard from '@/components/betting/MatchCard';
import { motion } from 'framer-motion';

export default function Matches() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list('match_time', 100),
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['bets'],
    queryFn: () => base44.entities.Bet.list('-created_date', 100),
  });

  const betByMatch = {};
  bets.forEach(b => { betByMatch[b.match_id] = b; });

  const filtered = matches.filter(m => {
    if (filter !== 'all' && m.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.team_a?.toLowerCase().includes(q) || m.team_b?.toLowerCase().includes(q) || m.group_stage?.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by date then by group_stage
  const groupedByDate = {};
  filtered.forEach(m => {
    const dateKey = m.match_time ? format(new Date(m.match_time), 'yyyy-MM-dd') : 'TBD';
    const dateLabel = m.match_time ? format(new Date(m.match_time), 'EEEE, MMM d · yyyy') : 'TBD';
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = { label: dateLabel, groups: {} };
    const gs = m.group_stage || 'Other';
    if (!groupedByDate[dateKey].groups[gs]) groupedByDate[dateKey].groups[gs] = [];
    groupedByDate[dateKey].groups[gs].push(m);
  });

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl p-8"
        style={{ background: 'linear-gradient(135deg, #1a1040 0%, #0f0a1e 50%, #12102a 100%)' }}
      >
        <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-3 py-1 rounded-full">
              <Trophy className="w-3 h-3 text-primary" />
              <span className="text-[11px] font-bold text-primary tracking-widest">WORLD CUP 2026</span>
            </div>
          </div>
          <h1 className="font-heading font-black text-3xl md:text-4xl leading-tight mb-2 text-white">
            Match Schedule
          </h1>
          <p className="text-white/60 text-sm max-w-md">
            Browse all 104 matches from the group stage to the final. Search by team, filter by status, and bet P2P on every match.
          </p>
        </div>
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
      >
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams or groups..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border/50 h-11 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="bg-card border border-border/50 rounded-xl">
              <TabsTrigger value="all" className="rounded-lg text-xs">All</TabsTrigger>
              <TabsTrigger value="live" className="rounded-lg text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                Live
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="rounded-lg text-xs">Upcoming</TabsTrigger>
              <TabsTrigger value="finished" className="rounded-lg text-xs">Finished</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </motion.div>

      {filtered.length > 0 ? (
        <div className="space-y-8">
          {sortedDates.map((dateKey, dateIndex) => {
            const { label, groups } = groupedByDate[dateKey];
            const sortedGroups = Object.keys(groups).sort();
            return (
              <motion.div
                key={dateKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: dateIndex * 0.05, duration: 0.4 }}
              >
                {/* Date header */}
                <div className="flex items-center gap-3 mb-5 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-3">
                  <div className="flex items-center gap-2.5 bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 rounded-2xl px-4 py-2 shadow-lg">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="font-heading font-bold text-base text-primary">{label}</span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-border/50 to-transparent" />
                </div>

                {/* Groups within this date */}
                <div className="space-y-6">
                  {sortedGroups.map((gs, gsIndex) => (
                    <motion.div
                      key={gs}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: dateIndex * 0.05 + gsIndex * 0.03 }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-2 bg-secondary/50 border border-border/30 rounded-xl px-3 py-1.5">
                          <span className="text-xs font-bold text-primary">{gs}</span>
                        </div>
                        <div className="flex-1 h-px bg-border/30" />
                        <span className="text-xs text-muted-foreground">{groups[gs].length} matches</span>
                      </div>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {groups[gs].map((m, i) => (
                          <MatchCard key={m.id} match={m} bet={betByMatch[m.id]} index={i} />
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
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