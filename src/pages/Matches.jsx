import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Trophy, Search, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import MatchCard from '@/components/betting/MatchCard';

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
      <div>
        <h1 className="font-heading font-black text-2xl mb-1">Matches</h1>
        <p className="text-sm text-muted-foreground">Browse all World Cup 2026 matches and active bets</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams or groups..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 rounded-xl"
          />
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="bg-secondary/50 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg text-xs">All</TabsTrigger>
            <TabsTrigger value="live" className="rounded-lg text-xs">Live</TabsTrigger>
            <TabsTrigger value="upcoming" className="rounded-lg text-xs">Upcoming</TabsTrigger>
            <TabsTrigger value="finished" className="rounded-lg text-xs">Finished</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-8">
          {sortedDates.map(dateKey => {
            const { label, groups } = groupedByDate[dateKey];
            const sortedGroups = Object.keys(groups).sort();
            return (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-4 sticky top-0 z-10 bg-background py-2">
                  <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <span className="font-heading font-bold text-sm text-primary">{label}</span>
                  </div>
                  <div className="flex-1 h-px bg-border/50" />
                </div>

                {/* Groups within this date */}
                <div className="space-y-5">
                  {sortedGroups.map(gs => (
                    <div key={gs}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{gs}</span>
                        <div className="flex-1 h-px bg-border/30" />
                      </div>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {groups[gs].map((m, i) => (
                          <MatchCard key={m.id} match={m} bet={betByMatch[m.id]} index={i} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No matches found</p>
        </div>
      )}
    </div>
  );
}