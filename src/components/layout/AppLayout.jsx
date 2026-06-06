import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Trophy, BarChart3, User, Layers, TrendingUp, Shield, Flame } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import WalletButton from '@/components/wallet/WalletButton';

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/matches', icon: Trophy, label: 'Matches' },
  { path: '/futures', icon: Flame, label: 'Futures' },
  { path: '/lp', icon: TrendingUp, label: 'LP' },
  { path: '/my-bets', icon: BarChart3, label: 'My Bets' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between w-full">
          <Link to="/" className="flex items-center gap-2.5 ml-8">
            <img src="https://media.base44.com/images/public/6a1da108eb293de119e4e930/610671979_Untitled-June032026at0751431.png" alt="ElevenX" className="h-24 object-contain" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            {isAdmin && (
              <Link to="/admin"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  location.pathname === '/admin'
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}>
                <Shield className="w-3.5 h-3.5" /> Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {/* Social links - visible on all screens */}
            <div className="flex items-center gap-1">
              <a href="https://x.com/elevenxbets" target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200">
                <TwitterIcon />
              </a>
              <a href="https://t.me" target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-all duration-200">
                <TelegramIcon />
              </a>
            </div>
            <div className="hidden sm:block w-px h-5 bg-border/50" />
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-full">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs text-muted-foreground font-medium">Solana</span>
            </div>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 pb-24 md:pb-6 overflow-x-hidden">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-t border-border/50 overflow-x-hidden">
        <div className="flex items-center justify-around py-2 px-2 w-full">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-xl transition-all duration-200 ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}