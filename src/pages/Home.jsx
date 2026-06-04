import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, Flame, TrendingUp, Zap, Globe, Star, ChevronRight, Clock, Users, DollarSign, Earth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MatchCard from '@/components/betting/MatchCard';
import HottestBetCard from '@/components/betting/HottestBetCard';
import { getTeamFlag } from '@/utils/flags';

const WC_PHOTOS = [
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
  'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
  'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80',
];

const FEATURED_MATCHES = [
  { team_a: 'Mexico', team_b: 'South Africa', group: 'Group A', date: 'Jun 11', matchId: '6a1e103ff521e27f3cc8935e', img: 'https://media.base44.com/images/public/6a1baa5af6f6dc0afc776c3f/a1d1835b2_image.png' },
  { team_a: 'South Korea', team_b: 'Czechia', group: 'Group A', date: 'Jun 12', matchId: '6a1e103ff521e27f3cc8935f', img: 'https://media.base44.com/images/public/6a1baa5af6f6dc0afc776c3f/cf05870f3_image.png' },
  { team_a: 'Canada', team_b: 'Bosnia and Herzegovina', group: 'Group B', date: 'Jun 12', matchId: '6a1e103ff521e27f3cc89360', img: 'https://media.base44.com/images/public/6a1baa5af6f6dc0afc776c3f/f0e42aabe_image.png' },
  { team_a: 'England', team_b: 'Jamaica', group: 'Group D', date: 'Jun 14', matchId: '6a1e103ff521e27f3cc89365', img: 'https://media.base44.com/images/public/6a1baa5af6f6dc0afc776c3f/e4dbfaa4c_image.png' },
];



export default function Home() {
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list('match_time', 100),
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['bets'],
    queryFn: () => base44.entities.Bet.list('-created_date', 50),
  });

  const { data: userBets = [] } = useQuery({
    queryKey: ['allUserBets'],
    queryFn: () => base44.entities.UserBet.list('-created_date', 100),
  });

  const { data: futuresMarkets = [] } = useQuery({
    queryKey: ['futures-markets'],
    queryFn: () => base44.entities.FuturesMarket.list(),
  });

  const openBets = bets.filter(b => b.status === 'open');
  const liveMatches = matches.filter(m => m.status === 'live');
  const upcomingMatches = matches.filter(m => m.status === 'upcoming')
    .sort((a, b) => new Date(a.match_time) - new Date(b.match_time));

  const betByMatch = {};
  bets.forEach(b => { betByMatch[b.match_id] = b; });

  const totalVolume = bets.reduce((s, b) => s + (b.total_pool || 0), 0);
  const activeBettors = new Set(userBets.map(ub => ub.created_by_id)).size;

  return (
    <div className="space-y-6 -mt-2">

      {/* ── HERO CARDS ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Card 1 — Main CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl min-h-[320px] flex flex-col justify-between p-7"
          style={{ background: 'linear-gradient(135deg, #1a1040 0%, #0f0a1e 50%, #12102a 100%)' }}
        >
          {/* Glow orbs */}
          <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
          <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
          {/* Grid lines decoration */}
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#a69cf2 1px, transparent 1px), linear-gradient(90deg, #a69cf2 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 bg-primary/20 border border-primary/30 px-3 py-1 rounded-full">
                <Zap className="w-3 h-3 text-primary" />
                <span className="text-[11px] font-bold text-primary tracking-widest">SOLANA POWERED</span>
              </div>
            </div>
            <h1 className="font-heading font-black text-3xl md:text-4xl leading-tight mb-3 text-white">
              Bet P2P.<br />
              <span className="text-primary" style={{ textShadow: '0 0 40px rgba(166,156,242,0.6)' }}>Win On-Chain.</span>
            </h1>
            <p className="text-white/60 text-sm leading-relaxed max-w-xs">
              The first fully decentralized World Cup betting pool. No house edge. No middlemen. Just pure odds between you and other fans.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap gap-3 mt-6">
            <Link to="/matches">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold px-6 h-11 rounded-xl text-sm" style={{ boxShadow: '0 0 24px rgba(166,156,242,0.35)' }}>
                <Trophy className="w-4 h-4 mr-2" />
                Start Betting
              </Button>
            </Link>
            <Link to="/my-bets">
              <Button variant="outline" className="font-heading font-medium h-11 rounded-xl border-white/15 text-white/80 bg-white/5 hover:bg-white/10">
                My Bets <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>

          {/* Floating stat chips */}
          <div className="absolute bottom-7 right-6 flex flex-col gap-2 items-end">
            <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#21c45d' }} />
              <span className="text-[11px] text-white/80 font-medium">0% platform fee</span>
            </div>
            <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <Flame className="w-3 h-3 text-primary" />
              <span className="text-[11px] text-white/80 font-medium">Instant settlement</span>
            </div>
          </div>
        </motion.div>

        {/* Card 2 — World Cup Hype */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl min-h-[320px] flex flex-col justify-between"
        >
          <img
            src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80"
            alt="World Cup"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,8,20,0.97) 0%, rgba(10,8,20,0.6) 50%, rgba(10,8,20,0.2) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(166,156,242,0.12) 0%, transparent 60%)' }} />

          <div className="relative z-10 p-7">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1 rounded-full">
                <Globe className="w-3 h-3 text-white/70" />
                <span className="text-[11px] font-bold text-white/80 tracking-wide">FIFA WORLD CUP 2026™</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 p-7">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary tracking-widest uppercase">48 Teams · 104 Matches</span>
            </div>
            <h2 className="font-heading font-black text-3xl md:text-4xl text-white leading-tight mb-3">
              One Trophy.<br />
              <span className="text-primary">Your Prediction.</span>
            </h2>
            <p className="text-white/60 text-sm mb-5">
              USA · Canada · Mexico hosting the biggest sporting event on Earth. Pick your winner and back it with SOL.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {['🇧🇷','🇫🇷','🇩🇪','🇦🇷','🏴󠁧󠁢󠁥󠁮󠁧󠁿'].map((flag, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-card border-2 border-background flex items-center justify-center text-sm">{flag}</div>
                ))}
              </div>
              <span className="text-xs text-white/50">+43 more nations</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── LIVE STATS BAR ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          { icon: DollarSign, label: 'Total Volume', value: `◎${totalVolume.toLocaleString()}`, color: 'text-primary', bg: 'bg-primary/10' },
          { icon: Users, label: 'Active Bettors', value: activeBettors.toString(), color: '', bg: '', style: { color: '#21c45d', background: 'rgba(33,196,93,0.1)' } },
          { icon: Flame, label: 'Open Bets', value: openBets.length.toString(), color: 'text-orange-400', bg: 'bg-orange-400/10' },
          { icon: Globe, label: 'Matches', value: matches.length.toString(), color: 'text-blue-400', bg: 'bg-blue-400/10' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-3"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.bg}`} style={stat.style ? { background: stat.style.background } : {}}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} style={stat.style ? { color: stat.style.color } : {}} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`font-heading font-bold text-lg leading-tight ${stat.color}`} style={stat.style ? { color: stat.style.color } : {}}>{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── FEATURED MATCHES HORIZONTAL SCROLL ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <h2 className="font-heading font-bold text-lg">Featured Matches</h2>
          </div>
          <Link to="/matches" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
           {FEATURED_MATCHES.map((fm, i) => {
             const matchBet = betByMatch[fm.matchId];
             const betUrl = matchBet ? `/bet/${matchBet.id}` : `/matches`;
             return (
             <motion.div
               key={i}
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 0.1 + i * 0.08 }}
               className="flex-shrink-0 w-64 h-80 bg-card border border-border/50 rounded-2xl overflow-hidden hover:border-primary/30 transition-all group flex flex-col"
             >
               {/* Match photo strip */}
               <div className="relative h-40 overflow-hidden flex-shrink-0">
                 <img
                   src={fm.img || WC_PHOTOS[(i + 1) % WC_PHOTOS.length]}
                   alt="match"
                   className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                   style={i === 1 ? { objectPosition: 'center 20%' } : {}}
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                 <div className="absolute top-2 left-2">
                   <span className="text-[10px] font-bold bg-black/50 backdrop-blur-sm text-white/90 px-2 py-0.5 rounded-full">{fm.group}</span>
                 </div>
                 <div className="absolute top-2 right-2">
                   <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-white text-green-500 border-green-500/30 shadow-sm">OPEN</span>
                 </div>
               </div>

               <div className="p-4 flex flex-col flex-1 justify-center">
                 {/* Teams */}
                 <div className="flex items-center justify-between mb-2">
                   <div className="text-center flex-1">
                     <div className="text-2xl mb-1">{getTeamFlag(fm.team_a)}</div>
                     <p className="font-heading font-bold text-xs leading-tight">{fm.team_a}</p>
                   </div>
                   <div className="flex flex-col items-center gap-0.5 px-2">
                     <span className="font-heading font-black text-primary text-sm">VS</span>
                     <span className="text-[9px] text-muted-foreground">{fm.date}</span>
                   </div>
                   <div className="text-center flex-1">
                     <div className="text-2xl mb-1">{getTeamFlag(fm.team_b)}</div>
                     <p className="font-heading font-bold text-xs leading-tight">{fm.team_b}</p>
                   </div>
                 </div>

                 <div className="mt-auto">
                   <Link to={betUrl} className="block">
                    <Button className="w-full h-9 text-xs font-heading font-bold rounded-xl border transition-colors"
                      style={{ background: 'rgba(33,196,93,0.1)', color: '#21c45d', borderColor: 'rgba(33,196,93,0.25)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(33,196,93,0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(33,196,93,0.1)'}>
                      Bet Now →
                    </Button>
                  </Link>
                  </div>
                  </div>
                  </motion.div>
                  );
                  })}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="font-heading font-bold text-lg">How It Works</h2>
          <span className="text-xs text-muted-foreground ml-1">P2P · No house edge</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              step: '01',
              icon: '🏦',
              title: 'LPs Back the Odds',
              desc: 'Liquidity Providers deposit SOL to cover bettors at fixed oracle odds. If bettors lose, LPs earn the stake. No house — pure P2P.',
              color: 'primary',
            },
            {
              step: '02',
              icon: '🎯',
              title: 'Bet at Fixed Odds',
              desc: 'Pick an outcome and stake SOL at the oracle-fixed price. Your payout is locked in the moment you bet — no slippage.',
              color: 'accent',
            },
            {
              step: '03',
              icon: '💸',
              title: 'Win & Claim',
              desc: 'After the match settles, winners claim their fixed payout instantly on-chain. Only a 2% fee — no hidden costs, ever.',
              color: 'yellow',
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08 }}
              className={`relative rounded-2xl p-5 border overflow-hidden ${
                item.color === 'primary' ? 'bg-primary/5 border-primary/20' :
                item.color === 'accent' ? 'bg-accent/5 border-accent/20' :
                'bg-yellow-500/5 border-yellow-500/20'
              }`}
            >
              <div className="absolute top-4 right-4 font-heading font-black text-4xl opacity-10 text-foreground">{item.step}</div>
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className={`font-heading font-bold text-base mb-2 ${
                item.color === 'primary' ? 'text-primary' :
                item.color === 'accent' ? 'text-accent' :
                'text-yellow-400'
              }`}>{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── LIVE MATCHES ── */}
      {liveMatches.length > 0 && (
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 bg-destructive/10 px-3 py-1 rounded-full border border-destructive/20">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-bold text-destructive">LIVE NOW</span>
            </div>
            <h2 className="font-heading font-bold text-lg">Live Matches</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {liveMatches.map((m, i) => (
              <MatchCard key={m.id} match={m} bet={betByMatch[m.id]} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      {/* ── OPEN BETS (TOP 4 BY LP) ── */}
      {openBets.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" />
              <h2 className="font-heading font-bold text-lg">Hottest Bets</h2>
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">Top 4 by LP</span>
            </div>
            <Link to="/matches" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {openBets
              .sort((a, b) => (b.total_pool || 0) - (a.total_pool || 0))
              .slice(0, 4)
              .map((bet, i) => {
                const match = matches.find(m => m.id === bet.match_id);
                if (!match) return null;
                return <HottestBetCard key={bet.id} match={match} bet={bet} index={i} />;
              })}
          </div>
        </section>
      )}

      {/* ── FEATURED FUTURES (6 CARDS) ── */}
      <section>
       <div className="flex items-center justify-between mb-4">
         <div className="flex items-center gap-2">
           <Trophy className="w-4 h-4 text-primary" />
           <h2 className="font-heading font-bold text-lg">Featured Futures</h2>
           <span className="bg-accent/10 text-accent text-[10px] font-bold px-2 py-0.5 rounded-full">Tournament Markets</span>
         </div>
         <Link to="/futures" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
           View all <ChevronRight className="w-3 h-3" />
         </Link>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         {futuresMarkets
           .filter(m => m.status === 'open' && m.country)
           .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
           .slice(0, 6)
           .map((market, i) => {
             const topOutcome = market.outcomes?.reduce((max, o) => o.odds > (max?.odds || 0) ? o : max, null);
             // Map country to group for navigation
             const countryToGroup = {
               'Brazil': 'E', 'Argentina': 'E', 'Paraguay': 'L', 'Uruguay': 'L',
               'USA': 'A', 'Mexico': 'A', 'Canada': 'B', 'England': 'D',
               'France': 'F', 'Germany': 'G', 'Spain': 'H', 'Portugal': 'I'
             };
             const group = countryToGroup[market.country] || 'A';
             return (
               <motion.div
                 key={market.id}
                 initial={{ opacity: 0, y: 15 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: i * 0.05 }}
                 className="bg-card border border-border/50 rounded-2xl overflow-hidden hover:border-primary/30 transition-all group"
               >
                 <Link to={`/futures?group=${group}`} className="block">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="text-4xl shrink-0">{market.country_flag || '🌍'}</div>
                        <div className="flex-1">
                          <h3 className="font-heading font-black text-lg text-foreground">{market.country}</h3>
                          <p className="text-xs text-muted-foreground">{market.subtitle || 'Tournament Finish'}</p>
                        </div>
                      </div>
                      {topOutcome && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase">Top Odds</p>
                              <p className="font-heading font-bold text-sm text-primary">{topOutcome.label}</p>
                            </div>
                            <Badge className="bg-primary/20 text-primary border border-primary/30 text-base font-bold px-3 py-1">
                              {topOutcome.odds.toFixed(1)}x
                            </Badge>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t border-border/30">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-bold text-foreground">◎{market.total_volume?.toFixed(2) || '0'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-primary font-bold group-hover:underline">
                          Bet Now <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
        </div>
      </section>

      {/* ── BOTTOM CTA BANNER ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-card to-accent/10 border border-primary/20 p-8 text-center"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-primary/10 blur-3xl rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Trophy className="w-10 h-10 text-primary" />
            <div className="w-10 h-10 flex items-center justify-center text-4xl">⚽</div>
            <Earth className="w-10 h-10 text-accent" />
          </div>
          <h2 className="font-heading font-black text-2xl md:text-3xl mb-2">
            48 Teams. 104 Matches. <span className="text-primary">One Champion.</span>
          </h2>
          <p className="text-muted-foreground text-sm mb-5 max-w-md mx-auto">
            Join thousands of bettors on the most decentralized sports betting platform — built on Solana for speed, transparency, and zero fees to the house.
          </p>
          <Link to="/matches">
            <Button className="font-heading font-bold px-10 h-12 rounded-xl text-sm text-white"
              style={{ background: '#21c45d', boxShadow: '0 0 28px rgba(33,196,93,0.3)' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <Trophy className="w-4 h-4 mr-2" />
              Start Betting Now
            </Button>
          </Link>
        </div>
      </motion.div>

    </div>
  );
}