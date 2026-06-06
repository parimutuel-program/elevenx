import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { WalletProvider } from '@/lib/WalletContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';
import Home from '@/pages/Home';
import Matches from '@/pages/Matches';
import Groups from '@/pages/Groups';
import BetDetail from '@/pages/BetDetail';
import MyBets from '@/pages/MyBets';
import Profile from '@/pages/Profile';
import Admin from '@/pages/Admin';
import MatchDetail from '@/pages/MatchDetail.jsx';
import LpDashboard from '@/pages/LpDashboard';
import Futures from '@/pages/Futures';
import RecreateMarket from '@/pages/RecreateMarket';
import InitPlatform from '@/pages/InitPlatform';
import Diagnostics from '@/pages/Diagnostics';
import FixAdmin from '@/pages/FixAdmin';
import DebugWallet from '@/pages/DebugWallet';
import DebugClaim from '@/pages/DebugClaim';
import DebugStorage from '@/pages/DebugStorage';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground font-medium">Loading ElevenX...</span>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // auth_required and other errors: allow through for testing
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/bet/:betId" element={<BetDetail />} />
        <Route path="/match/:matchId" element={<MatchDetail />} />
        <Route path="/my-bets" element={<MyBets />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/lp" element={<LpDashboard />} />
        <Route path="/futures" element={<Futures />} />
        <Route path="/recreate-market" element={<RecreateMarket />} />
        <Route path="/init-platform" element={<InitPlatform />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="/fix-admin" element={<FixAdmin />} />
        <Route path="/debug-wallet" element={<DebugWallet />} />
        <Route path="/debug-claim" element={<DebugClaim />} />
        <Route path="/debug-storage" element={<DebugStorage />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </WalletProvider>
    </AuthProvider>
  )
}

export default App