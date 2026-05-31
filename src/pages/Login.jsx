import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';

export default function Login() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const { checkUserAuth } = useAuth();

  const getPhantom = () => {
    if (typeof window !== 'undefined' && window.solana?.isPhantom) {
      return window.solana;
    }
    return null;
  };

  // Check for wallet address in URL (from registration redirect)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const walletFromUrl = params.get('wallet');
    const registered = params.get('registered');
    if (walletFromUrl && registered) {
      console.log('Registration detected, auto-logging in with wallet:', walletFromUrl);
      // Set wallet session
      localStorage.setItem('elevenx_wallet_session', JSON.stringify({ address: walletFromUrl, connectedAt: Date.now() }));
      localStorage.setItem('elevenx_authenticated', 'true');
      // Verify with backend and redirect
      base44.functions.invoke('walletAuth', { walletAddress: walletFromUrl })
        .then((response) => {
          if (response.data.success) {
            console.log('✓ Auto-login successful:', response.data.full_name || response.data.username);
            setTimeout(() => {
              window.location.href = '/';
            }, 100);
          }
        })
        .catch((err) => {
          console.error('Auto-login verification failed:', err);
        });
    }
  }, []);

  const handleWalletLogin = async (preconnectedWallet) => {
    const phantom = getPhantom();
    
    if (!phantom && !preconnectedWallet) {
      window.open('https://phantom.app/', '_blank');
      setError('Phantom wallet not found. Please install it.');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      let walletAddress = preconnectedWallet;
      
      // If no preconnected wallet, connect to Phantom
      if (!walletAddress) {
        const resp = await phantom.connect();
        walletAddress = resp.publicKey.toString();
      }

      // Verify user exists with backend
      const response = await base44.functions.invoke('walletAuth', {
        walletAddress
      });

      if (response.data.needsRegistration) {
        setError('Wallet not registered. Please register first.');
        if (phantom) await phantom.disconnect();
        setTimeout(() => {
          window.location.href = '/register';
        }, 2000);
        return;
      }

      if (response.data.success) {
        console.log('✓ Login successful, user verified:', response.data.username, response.data.full_name);
        // Set wallet session marker for AuthContext to recognize (JSON format)
        localStorage.setItem('elevenx_wallet_session', JSON.stringify({ address: walletAddress, connectedAt: Date.now() }));
        localStorage.setItem('elevenx_authenticated', 'true');
        
        // Hard redirect to reload app with auth state
        window.location.href = '/';
        return;
      }

    } catch (err) {
      console.error('Wallet login failed:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <AuthLayout
      icon={Wallet}
      title="Welcome Back"
      subtitle="Connect your wallet to access ElevenX"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        <Button
          onClick={handleWalletLogin}
          disabled={isConnecting}
          className="w-full h-12 font-heading font-bold rounded-xl text-sm"
          style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)', boxShadow: '0 0 16px rgba(166,156,242,0.25)' }}
        >
          {isConnecting ? (
            <>
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="w-5 h-5 mr-2" />
              Connect Phantom Wallet
            </>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Secure & Decentralized</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            By connecting your wallet, you agree to our Terms of Service
          </p>
          <p className="text-xs text-muted-foreground">
            Don't have an account?{' '}
            <a href="/register" className="text-primary hover:underline">Register here</a>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}