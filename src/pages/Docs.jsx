import React from 'react';
import { motion } from 'framer-motion';
import { 
  Trophy, 
  Zap, 
  Shield, 
  Globe, 
  TrendingUp, 
  Wallet, 
  CheckCircle, 
  ArrowRight,
  BookOpen,
  Sparkles,
  Lock,
  RefreshCcw,
  Users,
  Award,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

export default function Docs() {
  const features = [
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "Dynamic Odds",
      description: "Real-time odds that adjust based on market activity and liquidity, ensuring fair pricing for all participants.",
      color: "text-primary"
    },
    {
      icon: <Wallet className="w-6 h-6" />,
      title: "Liquidity Provider Rewards",
      description: "Earn fees by providing liquidity to betting pools. LPs receive a share of every matched bet.",
      color: "text-accent"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Fully Decentralized",
      description: "Built on Solana blockchain for transparent, trustless betting. No intermediaries, no manipulation.",
      color: "text-primary"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Instant Settlements",
      description: "Automated on-chain settlement means winners get paid immediately after events conclude.",
      color: "text-accent"
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: "Global Access",
      description: "No geographic restrictions. Anyone with a Solana wallet can participate.",
      color: "text-primary"
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: "Non-Custodial",
      description: "You maintain full control of your funds. Smart contracts handle all transactions automatically.",
      color: "text-accent"
    }
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Connect Wallet",
      description: "Link your Phantom wallet to get started. No KYC, no signups required.",
      icon: <Wallet className="w-8 h-8" />
    },
    {
      step: "02",
      title: "Choose Your Bet",
      description: "Browse live matches and futures markets. Select your outcome and stake amount.",
      icon: <Trophy className="w-8 h-8" />
    },
    {
      step: "03",
      title: "Sign Transaction",
      description: "Confirm your bet with a single Solana transaction. Funds are locked in the pool.",
      icon: <CheckCircle className="w-8 h-8" />
    },
    {
      step: "04",
      title: "Win & Claim",
      description: "If your outcome wins, claim your payout instantly after settlement.",
      icon: <Award className="w-8 h-8" />
    }
  ];

  const stats = [
    { value: "0.01 SOL", label: "Minimum Bet", icon: <TrendingUp className="w-5 h-5" /> },
    { value: "Instant", label: "Payouts", icon: <Zap className="w-5 h-5" /> },
    { value: "100%", label: "Transparent", icon: <Shield className="w-5 h-5" /> },
    { value: "24/7", label: "Global Markets", icon: <Globe className="w-5 h-5" /> }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px]" />
        <div className="container mx-auto px-4 py-12 md:py-20 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-4xl mx-auto"
          >
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-xs px-4 py-1.5">
              <Sparkles className="w-3 h-3 mr-1" />
              Welcome to ElevenX
            </Badge>
            <h1 className="font-heading font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 md:mb-6 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              The Future of Decentralized Betting
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto px-2">
              Experience the next generation of peer-to-peer betting powered by Solana. 
              Transparent odds, instant payouts, and rewards for liquidity providers.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-2">
              <Button asChild className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl font-bold text-sm sm:text-base w-full sm:w-auto">
                <Link to="/matches">
                  Start Betting
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl font-bold text-sm sm:text-base w-full sm:w-auto">
                <Link to="/lp">
                  Become an LP
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 md:py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <div className="text-primary mb-2">{stat.icon}</div>
                <div className="font-heading font-black text-xl md:text-2xl mb-1">{stat.value}</div>
                <div className="text-xs text-muted-foreground text-center">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why ElevenX Section */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4 px-2">
              Why ElevenX is <span className="text-primary">Brilliant</span>
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
              We've reimagined betting from the ground up, leveraging blockchain technology 
              to create a fair, transparent, and rewarding experience for everyone.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group p-5 md:p-6 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/30 transition-all duration-300"
              >
                <div className={`mb-4 ${feature.color}`}>{feature.icon}</div>
                <h3 className="font-heading font-bold text-lg md:text-xl mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-12 md:py-20 bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
              Get started in minutes. No complicated signups, no waiting for approvals.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {howItWorks.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                {i < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-primary/30 to-transparent -translate-x-8" />
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 border-2 border-primary/30 mb-4 md:mb-6 mx-auto">
                    <div className="text-primary w-10 h-10 sm:w-12 sm:h-12">{step.icon}</div>
                  </div>
                  <div className="text-[10px] font-bold text-primary mb-2">STEP {step.step}</div>
                  <h3 className="font-heading font-bold text-base sm:text-lg mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Betting Markets Section */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4">
              Betting Markets
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
              Choose from live match betting or long-term futures on tournament outcomes.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
            {/* Match Betting */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-3xl border border-border/50 bg-card/50 hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <h3 className="font-heading font-bold text-xl sm:text-2xl">Match Betting</h3>
              </div>
              <p className="text-muted-foreground mb-6 text-sm md:text-base">
                Bet on individual match outcomes with dynamic odds that reflect real-time market activity. 
                Choose from home win, away win, or draw.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Live odds from The Odds API</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Parimutuel pool betting</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Instant settlement after match ends</span>
                </li>
              </ul>
              <Button asChild className="w-full rounded-xl font-bold text-sm sm:text-base">
                <Link to="/matches">
                  Browse Matches
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </motion.div>

            {/* Futures Betting */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-3xl border border-border/50 bg-card/50 hover:border-accent/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
                </div>
                <h3 className="font-heading font-bold text-xl sm:text-2xl">Futures Markets</h3>
              </div>
              <p className="text-muted-foreground mb-6 text-sm md:text-base">
                Long-term bets on tournament outcomes. Predict which team will finish 1st, 2nd, or 3rd 
                in the World Cup or other major tournaments.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-sm">High multiplier odds (2x-50x+)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-sm">LP-backed liquidity pools</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Settled after tournament concludes</span>
                </li>
              </ul>
              <Button asChild variant="outline" className="w-full rounded-xl font-bold text-sm sm:text-base">
                <Link to="/futures">
                  View Futures
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* LP Section */}
      <section className="py-12 md:py-20 bg-gradient-to-r from-accent/5 via-background to-accent/5">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
              <Users className="w-3 h-3 mr-1" />
              Liquidity Providers
            </Badge>
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4 px-2">
              Earn Passive Income as an LP
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
              Provide liquidity to betting pools and earn a share of fees on every matched bet. 
              Your SOL works for you.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto bg-card/50 border border-border/50 rounded-3xl p-6 md:p-12">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-accent mb-2">2-5%</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Fee Share per Bet</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-accent mb-2">Flexible</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Withdraw Anytime</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-accent mb-2">Auto-Compounding</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Maximize Returns</div>
              </div>
            </div>
            <Button asChild className="w-full h-12 sm:h-14 rounded-xl font-bold text-base sm:text-lg bg-accent hover:bg-accent/90">
              <Link to="/lp">
                Start Providing Liquidity
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4 px-2">
              Built on Solana
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
              Leveraging the speed and security of Solana blockchain for instant, 
              trustless transactions.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 max-w-5xl mx-auto">
            {[
              { label: "Transaction Speed", value: "~400ms", icon: <Zap className="w-5 h-5" /> },
              { label: "Transaction Cost", value: "<$0.01", icon: <TrendingUp className="w-5 h-5" /> },
              { label: "Network Uptime", value: "99.9%", icon: <RefreshCcw className="w-5 h-5" /> },
              { label: "Security", value: "Audited", icon: <Shield className="w-5 h-5" /> }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-4 md:p-6 rounded-2xl border border-border/50 bg-card/50 text-center"
              >
                <div className="text-primary mb-3 flex justify-center">{item.icon}</div>
                <div className="font-heading font-black text-xl md:text-2xl mb-1">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* World Cup 2026 Section */}
      <section className="py-12 md:py-20 bg-gradient-to-b from-background via-yellow-500/5 to-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <Badge className="mb-4 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              <Trophy className="w-3 h-3 mr-1" />
              FIFA World Cup 2026
            </Badge>
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4 px-2">
              Built for the <span className="text-yellow-400">2026 World Cup</span>
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto px-2">
              The biggest sporting event in history — 48 teams, 104 matches, 3 host nations. ElevenX is the first fully on-chain betting protocol built specifically for this tournament.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-10">
            {/* Card 1: 48 Nations */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-3xl border border-yellow-500/20 bg-yellow-500/5"
            >
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="font-heading font-black text-xl md:text-2xl text-yellow-400 mb-2">48 Nations, 48 Markets</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                One futures market per country competing in the 2026 World Cup. Bet on 1st, 2nd, or 3rd place finishes.
              </p>
            </motion.div>

            {/* Card 2: 72 Match Markets */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-3xl border border-yellow-500/20 bg-yellow-500/5"
            >
              <div className="text-4xl mb-4">⚽</div>
              <h3 className="font-heading font-black text-xl md:text-2xl text-yellow-400 mb-2">72 Match Markets</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Every group stage and knockout match has its own on-chain betting pool deployed before kickoff.
              </p>
            </motion.div>

            {/* Card 3: Launch Date */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-3xl border border-yellow-500/20 bg-yellow-500/5"
            >
              <div className="text-4xl mb-4">📅</div>
              <h3 className="font-heading font-black text-xl md:text-2xl text-yellow-400 mb-2">Launches June 11, 2026</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                The World Cup begins June 11. Markets go live as each match is deployed to Solana by the admin.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto rounded-3xl border border-yellow-500/20 bg-yellow-500/5 p-6 md:p-8 text-center"
          >
            <p className="text-muted-foreground text-sm md:text-base mb-5 leading-relaxed">
              Every group stage match, every knockout fixture — ElevenX deploys an on-chain market for each one. Bet on match outcomes, or take a longer view with futures markets predicting where all 48 nations finish.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="rounded-xl font-bold bg-yellow-500 hover:bg-yellow-400 text-yellow-950">
                <Link to="/matches">
                  View All Matches
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl font-bold border-yellow-500/30 hover:border-yellow-500/60 text-yellow-400">
                <Link to="/futures">
                  Explore Futures Markets
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Security & Transparency Section */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <div className="text-center mb-10">
              <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <Shield className="w-3 h-3 mr-1" />
                Security & Transparency
              </Badge>
              <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl mb-3">
                Don't Trust. <span className="text-emerald-400">Verify.</span>
              </h2>
              <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto">
                Everything on ElevenX can be verified on-chain or in our open-source code. Read the full security report below.
              </p>
            </div>

            {/* Security doc card */}
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 md:p-8 mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-heading font-bold text-lg text-emerald-400">ElevenX — Security &amp; Transparency</h3>
                  <p className="text-xs text-muted-foreground">Full audit report · Open source · On-chain verifiable</p>
                </div>
                <a
                  href="https://media.base44.com/files/public/6a1da108eb293de119e4e930/e956f23e8_ElevenX_Security_Transparency.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Read Report
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Open-source smart contract — read every line",
                  "No admin backdoor in the deployed program",
                  "Fees hard-capped at 2% in code",
                  "Funds cannot be locked — users always claim or refund",
                  "Trust-minimized oracle-based settlement",
                  "Independent audit in progress"
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* GitHub + Claude row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* GitHub */}
              <a
                href="https://github.com/parimutuel-program/elevenx"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-5 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/30 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-[#161b22] border border-white/10 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">ElevenX on GitHub</p>
                  <p className="text-xs text-muted-foreground truncate">github.com/parimutuel-program/elevenx</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </a>

              {/* Claude AI reference */}
              <div className="flex items-center gap-4 p-5 rounded-2xl border border-border/50 bg-card/50">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #D4A574 0%, #C8956C 50%, #B8814A 100%)' }}>
                  <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
                    <path d="M20 8C13.37 8 8 13.37 8 20s5.37 12 12 12 12-5.37 12-12S26.63 8 20 8zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm6 14H14v-2c0-2 4-3.1 6-3.1s6 1.1 6 3.1v2z" fill="white" opacity="0.9"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm text-foreground">Built with Claude AI</p>
                  <p className="text-xs text-muted-foreground">Security analysis &amp; smart contract logic reviewed by Anthropic's Claude</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-20 bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-4 md:mb-6 px-2">
              Ready to Start?
            </h2>
            <p className="text-muted-foreground text-base md:text-lg mb-6 md:mb-8 px-2">
              Join the decentralized betting revolution. Connect your wallet and experience 
              the future of peer-to-peer betting today.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-2">
              <Button asChild className="h-12 sm:h-14 px-6 sm:px-8 rounded-xl font-bold text-sm sm:text-lg w-full sm:w-auto">
                <Link to="/matches">
                  Start Betting Now
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 sm:h-14 px-6 sm:px-8 rounded-xl font-bold text-sm sm:text-lg w-full sm:w-auto">
                <Link to="/futures">
                  Explore Futures
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 md:py-12 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-heading font-black text-xl">ElevenX</div>
                <div className="text-xs text-muted-foreground">Decentralized Betting Protocol</div>
              </div>
            </div>
            <div className="flex items-center gap-4 md:gap-6 text-xs sm:text-sm text-muted-foreground text-center md:text-right">
              <span>Built on Solana</span>
              <span className="hidden sm:inline">•</span>
              <span>Powered by Community</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}