import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, Flame, TrendingUp, Zap, Globe, Star, ChevronRight, Clock, Users, DollarSign, Earth, Ban, Coins, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MatchCard from '@/components/betting/MatchCard';
import HottestBetCard from '@/components/betting/HottestBetCard';
import { getTeamFlag } from '@/utils/flags';

const WC_PHOTOS = [
'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=800&q=80'];


const FEATURED_MATCHES = [
{ team_a: 'Mexico', team_b: 'South Africa', group: 'Group A', date: 'Jun 11', matchId: '6a20ec5003fec97668e1177c', img: 'https://media.base44.com/images/public/6a1baa5af6f6dc0afc776c3f/a1d1835b2_image.png' },
{ team_a: 'South Korea', team_b: 'Czech Republic', group: 'Group A', date: 'Jun 12', matchId: '6a20ec5003fec97668e1177d', img: 'https://media.base44.com/images/public/6a1da108eb293de119e4e930/8290ef7dc_image.png' },
{ team_a: 'Brazil', team_b: 'Morocco', group: 'Group E', date: 'Jun 12', matchId: '6a20ec5003fec97668e1177e', img: 'https://media.base44.com/images/public/6a1baa5af6f6dc0afc776c3f/f0e42aabe_image.png', odds_a: 1.85, odds_b: 4.20, odds_draw: 3.50 },
{ team_a: 'USA', team_b: 'Uruguay', group: 'Group D', date: 'Jun 13', matchId: '6a20ec5003fec97668e1177f', img: 'https://media.base44.com/images/public/6a1da108eb293de119e4e930/6adfc36e9_image.png' },
{ team_a: 'Netherlands', team_b: 'Japan', group: 'Group C', date: 'Jun 14', matchId: '', img: 'https://media.base44.com/images/public/6a1da108eb293de119e4e930/21177f821_image.png' },
{ team_a: 'England', team_b: 'Croatia', group: 'Group D', date: 'Jun 14', matchId: '', img: 'https://media.base44.com/images/public/6a1da108eb293de119e4e930/a48a1d137_image.png' },
{ team_a: 'France', team_b: 'Norway', group: 'Group F', date: 'Jun 15', matchId: '', img: 'https://media.base44.com/images/public/6a1da108eb293de119e4e930/3d0f9a726_image.png' },
{ team_a: 'Spain', team_b: 'Uruguay', group: 'Group H', date: 'Jun 15', matchId: '', img: 'https://media.base44.com/images/public/6a1da108eb293de119e4e930/2b6caa45a_image.png' }];




export default function Home() {
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list('match_time', 100)
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['bets'],
    queryFn: () => base44.entities.Bet.list('-created_date', 50)
  });

  const { data: userBets = [] } = useQuery({
    queryKey: ['allUserBets'],
    queryFn: () => base44.entities.UserBet.list('-created_date', 100)
  });

  const { data: futuresMarkets = [] } = useQuery({
    queryKey: ['futures-markets'],
    queryFn: () => base44.entities.FuturesMarket.list()
  });

  const openBets = bets.filter((b) => b.status === 'open');
  const liveMatches = matches.filter((m) => m.status === 'live');
  const upcomingMatches = matches.filter((m) => m.status === 'upcoming').
  sort((a, b) => new Date(a.match_time) - new Date(b.match_time));

  const betByMatch = {};
  bets.forEach((b) => {betByMatch[b.match_id] = b;});

  const totalVolume = bets.reduce((s, b) => s + (b.total_pool || 0), 0);
  const activeBettors = new Set(userBets.map((ub) => ub.created_by_id)).size;

  return (
    <div className="space-y-6 -mt-2">

      {/* ── HERO CARDS ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Card 1 — World Cup Hype (Football Image) - Shows first on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl min-h-[300px] sm:min-h-[320px] flex flex-col justify-between order-1 md:order-1">
          
          <img
            src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80"
            alt="World Cup"
            className="absolute inset-0 w-full h-full object-cover" />
          
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,8,20,0.97) 0%, rgba(10,8,20,0.6) 50%, rgba(10,8,20,0.2) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(166,156,242,0.12) 0%, transparent 60%)' }} />

          <div className="relative z-10 p-5 sm:p-7 pt-6">
            <div className="flex items-center gap-2">
              


              
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 px-2.5 sm:px-3 py-1 rounded-full">
                  <Zap className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] sm:text-[11px] font-bold text-white/80 tracking-wide">Powered by Solana</span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText('ElevenXContractAddr1111111111111111111')}
                  className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 px-2.5 sm:px-3 py-1 rounded-full hover:border-primary/30 transition-all group"
                  title="Copy contract address"
                >
                  <span className="text-[10px] sm:text-[11px] font-bold text-white/60 tracking-wide">Contract</span>
                  <svg className="w-3 h-3 text-white/60 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="relative z-10 p-5 sm:p-7">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary tracking-widest uppercase">WORLD CUP 2026</span>
            </div>
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl text-white leading-tight mb-2 sm:mb-3">
              The First Hybrid<br />
              <span className="text-primary">Betting Protocol</span>
            </h2>
            <p className="text-white/60 text-xs sm:text-sm mb-4 sm:mb-5">
              Revolutionary parimutuel model meets fixed odds. No house edge. LPs earn fees. Everyone can be the house. Built on Solana.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary tracking-wide">0% HOUSE EDGE</span>
              <span className="text-[10px] font-bold text-accent tracking-wide">LP FEE SHARING</span>
              <span className="text-[10px] font-bold text-yellow-400 tracking-wide">P2P MARKETS</span>
            </div>
            
            {/* World Cup branding flags */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
              <span className="text-[9px] text-white/40 uppercase tracking-wider">Featuring:</span>
              <span className="text-xl">🇺🇸</span>
              <span className="text-xl">🇧🇷</span>
              <span className="text-xl">🇦🇷</span>
              <span className="text-xl">🇫🇷</span>
              <span className="text-xl">🇩🇪</span>
              <span className="text-xl">🇪🇸</span>
            </div>
          </div>
        </motion.div>

        {/* Card 2 — Main CTA (BetP2P) - Shows second on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl min-h-[300px] sm:min-h-[320px] flex flex-col justify-between p-5 sm:p-7 order-2 md:order-2"
          style={{ background: '#121212' }}>
          
          {/* Glow orbs */}
          <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
          <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
          {/* Grid lines decoration */}
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#a69cf2 1px, transparent 1px), linear-gradient(90deg, #a69cf2 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <div className="relative z-10 pt-6">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <div className="flex items-center gap-1.5 bg-accent/20 border border-accent/30 px-2.5 sm:px-3 py-1 rounded-full">
                <TrendingUp className="w-3 h-3 text-accent" />
                <span className="text-[10px] sm:text-[11px] font-bold text-accent tracking-widest">HYBRID MODEL</span>
              </div>
            </div>
            <h1 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl leading-tight mb-2 sm:mb-3 text-white">
              Be The House.<br />
              <span className="text-emerald-400" style={{ textShadow: '0 0 25px rgba(16,185,129,0.4)' }}>Earn The Fees.</span>
            </h1>
            <p className="text-white/60 text-xs sm:text-sm leading-relaxed max-w-xs">
              Provide liquidity, earn 2% fees on every bet, and profit when bettors lose. No house edge — the community controls the pool.
            </p>
          </div>

          <div className="relative z-10 mt-5 sm:mt-6">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
              <Link to="/lp" className="flex-1">
                <Button className="w-full font-heading font-bold px-4 sm:px-6 h-10 sm:h-12 rounded-xl text-xs sm:text-sm text-black" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 0 18px rgba(16,185,129,0.25)' }}>
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                  Provide Liquidity
                </Button>
              </Link>
              <Link to="/matches" className="flex-1">
                <Button variant="outline" className="w-full font-heading font-medium h-10 sm:h-12 rounded-xl border-white/15 text-white/80 bg-white/5 hover:bg-white/10">
                  Place Bet <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>


        </motion.div>
      </div>

      {/* ── LIVE STATS BAR ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3">
        
        {[
        { icon: DollarSign, label: 'Total Volume', value: `◎${totalVolume.toLocaleString()}`, color: 'text-primary', bg: 'bg-primary/10' },
        { icon: Users, label: 'Active Bettors', value: activeBettors.toString(), color: '', bg: '', style: { color: '#21c45d', background: 'rgba(33,196,93,0.1)' } },
        { icon: Flame, label: 'Open Bets', value: openBets.length.toString(), color: 'text-orange-400', bg: 'bg-orange-400/10' },
        { icon: Globe, label: 'Matches', value: matches.length.toString(), color: 'text-blue-400', bg: 'bg-blue-400/10' }].
        map((stat, i) =>
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 + i * 0.05 }}
          className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-3">
          
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.bg}`} style={stat.style ? { background: stat.style.background } : {}}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} style={stat.style ? { color: stat.style.color } : {}} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`font-heading font-bold text-lg leading-tight ${stat.color}`} style={stat.style ? { color: stat.style.color } : {}}>{stat.value}</p>
            </div>
          </motion.div>
        )}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FEATURED_MATCHES.map((fm, i) => {
            const bet = betByMatch[fm.matchId];
            return (
              <Link to={`/match/${fm.matchId}`} className="group block">
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  className="relative rounded-2xl p-4 transition-all duration-300 border border-primary/20 bg-card h-full">

                  {/* Match Image Header */}
                  <div className="relative h-40 -mx-4 -mt-4 mb-3 overflow-hidden rounded-t-2xl">
                    <img
                      src={fm.img || WC_PHOTOS[(i + 1) % WC_PHOTOS.length]}
                      alt="match"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      style={{ objectPosition: 'center 15%' }} />
                  </div>

                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-muted-foreground font-semibold truncate">
                      {fm.group}
                    </span>
                    <Badge className="text-[9px] font-semibold uppercase tracking-wider bg-secondary text-secondary-foreground flex-shrink-0">
                      UPCOMING
                    </Badge>
                  </div>

                  {/* Match Matchup */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {/* Team A */}
                    <div className="flex-1 text-center">
                      <div className="text-2xl mb-1">{getTeamFlag(fm.team_a)}</div>
                      <p className="text-[10px] text-foreground truncate font-medium">{fm.team_a}</p>
                    </div>

                    {/* VS */}
                    <div className="flex flex-col items-center gap-1 px-2 flex-shrink-0">
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">VS</span>
                      <span className="text-[10px] text-muted-foreground font-medium">{fm.date}</span>
                    </div>

                    {/* Team B */}
                    <div className="flex-1 text-center">
                      <div className="text-2xl mb-1">{getTeamFlag(fm.team_b)}</div>
                      <p className="text-[10px] text-foreground truncate font-medium">{fm.team_b}</p>
                    </div>
                  </div>

                  {/* Odds/Pool */}
                  <div className="pt-2.5 border-t border-border/50">
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="rounded-lg px-1.5 py-1 text-center text-xs border bg-primary/5 border-primary/10">
                        <p className="text-[9px] text-muted-foreground truncate">{fm.team_a.split(' ').pop()}</p>
                        <p className="font-bold text-primary text-xs">
                          {fm.odds_a || bet?.odds_a ? (fm.odds_a || bet.odds_a).toFixed(2) : '—'}x
                        </p>
                      </div>
                      <div className="rounded-lg px-1.5 py-1 text-center text-xs border bg-yellow-500/5 border-yellow-500/10">
                        <p className="text-[9px] text-muted-foreground">Draw</p>
                        <p className="font-bold text-yellow-400 text-xs">
                          {fm.odds_draw || bet?.odds_draw ? (fm.odds_draw || bet.odds_draw).toFixed(2) : '—'}x
                        </p>
                      </div>
                      <div className="rounded-lg px-1.5 py-1 text-center text-xs border bg-accent/5 border-accent/10">
                        <p className="text-[9px] text-muted-foreground truncate">{fm.team_b.split(' ').pop()}</p>
                        <p className="font-bold text-accent text-xs">
                          {fm.odds_b || bet?.odds_b ? (fm.odds_b || bet.odds_b).toFixed(2) : '—'}x
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>◎{(bet?.total_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </motion.div>
                </Link>);

          })}
          </div>
      </section>

      {/* ── WHY ELEVENX ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}>
        
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="font-heading font-bold text-lg">Why ElevenX?</h2>
          <span className="text-xs text-muted-foreground ml-1">The Hybrid Revolution</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
          {
            icon: Ban,
            title: 'No House Edge',
            desc: 'Traditional bookies take 5-10%. We take ZERO. The entire pool goes to winners and LPs. Pure P2P fairness.',
            color: 'accent',
            highlight: true
          },
          {
            icon: Coins,
            title: 'LP Fee Distribution',
            desc: 'Every bet charges 2% fees — distributed directly to Liquidity Providers. Earn passive income just by holding liquidity.',
            color: 'primary',
            highlight: true
          },
          {
            icon: Crown,
            title: 'Everyone Can Be The House',
            desc: 'No gatekeepers. Deposit SOL, back any outcome, and collect fees when bettors match against your liquidity.',
            color: 'yellow',
            highlight: true,
            wcLogo: true
          }].
          map((item, i) =>
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + i * 0.08 }}
            className={`relative rounded-2xl p-5 border overflow-hidden ${
            item.color === 'primary' ? 'bg-primary/5 border-primary/20' :
            item.color === 'accent' ? 'bg-accent/5 border-accent/20' :
            'bg-yellow-500/5 border-yellow-500/20'}`
            }>
            
              <div className="flex items-start justify-between mb-3">
                <item.icon className={`w-8 h-8 ${
              item.color === 'primary' ? 'text-primary' :
              item.color === 'accent' ? 'text-accent' :
              'text-yellow-400'}`
              } />
                {item.wcLogo && (
                  <img
                    src="https://media.base44.com/images/public/6a1da108eb293de119e4e930/676f19c8c_Pngtree2026fifaworldcuplogo_21016269.png"
                    alt="FIFA World Cup 2026"
                    className="h-14 w-auto object-contain"
                  />
                )}
              </div>
              <h3 className={`font-heading font-bold text-base mb-2 ${
            item.color === 'primary' ? 'text-primary' :
            item.color === 'accent' ? 'text-accent' :
            'text-yellow-400'}`
            }>{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              {item.highlight &&
            <div className={`mt-3 pt-3 border-t ${
            item.color === 'primary' ? 'border-primary/20' :
            item.color === 'accent' ? 'border-accent/20' :
            'border-yellow-500/20'}`
            }>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${
              item.color === 'primary' ? 'text-primary' :
              item.color === 'accent' ? 'text-accent' :
              'text-yellow-400'}`
              }>
                    🎯 Investor Favorite
                  </p>
                </div>
            }
            </motion.div>
          )}
        </div>
      </motion.section>

      {/* ── LIVE MATCHES ── */}
      {liveMatches.length > 0 &&
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 bg-destructive/10 px-3 py-1 rounded-full border border-destructive/20">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-bold text-destructive">LIVE NOW</span>
            </div>
            <h2 className="font-heading font-bold text-lg">Live Matches</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {liveMatches.map((m, i) =>
          <MatchCard key={m.id} match={m} bet={betByMatch[m.id]} index={i} />
          )}
          </div>
        </motion.section>
      }

      {/* ── FEATURED FUTURES (6 CARDS) ── */}
      <section>
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
            <h2 className="font-heading font-bold text-lg">Featured Futures</h2>
            <span className="hidden sm:inline bg-accent/10 text-accent text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">Tournament Markets</span>
          </div>
          <Link to="/futures" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium flex-shrink-0">
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {futuresMarkets.
          filter((m) => m.status === 'open' && m.country).
          sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0)).
          slice(0, 6).
          map((market, i) => {
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
                className="bg-card border border-border/50 rounded-2xl overflow-hidden hover:border-primary/30 transition-all group h-full">
                 
                  <Link to={`/futures?group=${group}`} className="block">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="text-4xl shrink-0">{market.country_flag || '🌍'}</div>
                        <div className="flex-1">
                          <h3 className="font-heading font-black text-lg text-foreground">{market.country}</h3>
                          <p className="text-xs text-muted-foreground">{market.subtitle || 'Tournament Finish'}</p>
                        </div>
                      </div>
                      {topOutcome &&
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase">Top Odds</p>
                              <p className="font-heading font-bold text-sm text-primary">{topOutcome.label}</p>
                            </div>
                            <Badge className="bg-accent/20 text-accent border border-accent/30 text-base font-bold px-3 py-1">
                              {topOutcome.odds.toFixed(1)}x
                            </Badge>
                          </div>
                        </div>
                    }
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
                </motion.div>);

          })}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="relative overflow-hidden rounded-3xl flex flex-col p-5 sm:p-7 mb-4"
        style={{ background: '#121212' }}>
        
        {/* Glow orbs */}
        <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-30" style={{ background: '#a69cf2' }} />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: '#14f195' }} />
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#a69cf2 1px, transparent 1px), linear-gradient(90deg, #a69cf2 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        
        <div className="relative z-10 space-y-5">
          {/* Powered by Solana + Socials */}
          <div className="flex flex-col gap-4">
            {/* Solana Branding */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Hyped Solana badge */}
              <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)', boxShadow: '0 0 24px rgba(153,69,255,0.5), 0 0 48px rgba(20,241,149,0.2)' }}>
                {/* Shine overlay */}
                <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0.4) 0%, transparent 50%)' }} />
                {/* Solana diamond logo */}
                <svg className="relative z-10 w-4 h-4 flex-shrink-0" viewBox="0 0 397 311" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="white"/>
                  <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="white"/>
                  <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="white"/>
                </svg>
                <div className="relative z-10 flex flex-col leading-none">
                  <span className="text-[8px] font-bold text-white/70 tracking-[0.15em] uppercase">Powered by</span>
                  <span className="text-sm font-black text-white tracking-tight" style={{ fontFamily: 'Arial Black, sans-serif', letterSpacing: '-0.02em' }}>SOLANA</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-white/50">
                <Zap className="w-3 h-3 text-[#14F195]" />
                <span>65,000 TPS</span>
                <span className="text-white/20">•</span>
                <span>Zero House Edge</span>
                <span className="text-white/20">•</span>
                <span className="text-[#14F195] font-semibold">On-chain</span>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold mr-1">Follow Us</span>
              {/* X / Twitter */}
              <a href="https://x.com/elevenxbets" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary/20 hover:border-primary/30 transition-all group">
                <svg className="w-3.5 h-3.5 text-white/70 group-hover:text-primary transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* Discord */}
              <a href="https://discord.gg" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all group">
                <svg className="w-3.5 h-3.5 text-white/70 group-hover:text-indigo-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
              {/* Telegram */}
              <a href="https://t.me" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-blue-500/20 hover:border-blue-500/30 transition-all group">
                <svg className="w-3.5 h-3.5 text-white/70 group-hover:text-blue-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src="https://media.base44.com/images/public/6a1da108eb293de119e4e930/e4f13eef5_Make_me_nice_clean_l-4110221.png" alt="ElevenX" className="w-8 h-8 rounded-lg object-cover" />
              <span className="text-xs text-white/50">© 2026 ElevenX. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-white/50">
              <a href="#" className="hover:text-primary transition-colors">Terms</a>
              <a href="#" className="hover:text-primary transition-colors">Privacy</a>
              <a href="#" className="hover:text-primary transition-colors">Docs</a>
            </div>
          </div>
        </div>
      </motion.footer>

    </div>);

}