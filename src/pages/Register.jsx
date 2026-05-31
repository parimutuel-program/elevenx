import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Wallet, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/components/AuthLayout';

export default function Register() {
  const [step, setStep] = useState('wallet'); // 'wallet' | 'details'
  const [walletAddress, setWalletAddress] = useState('');
  const [fullName, setFullName] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const getPhantom = () => {
    if (typeof window !== 'undefined' && window.solana?.isPhantom) {
      return window.solana;
    }
    return null;
  };

  const handleConnectWallet = async () => {
    const phantom = getPhantom();
    
    if (!phantom) {
      window.open('https://phantom.app/', '_blank');
      setError('Phantom wallet not found. Please install it from phantom.app');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      const resp = await phantom.connect();
      const address = resp.publicKey.toString();
      console.log('Wallet connected:', address);
      setWalletAddress(address);
      setStep('details');
    } catch (err) {
      console.error('Wallet connect failed:', err);
      setError(err.message || 'Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRegister = async () => {
    if (!fullName) {
      setError('Please enter your name');
      return;
    }

    setIsRegistering(true);
    setError('');

    try {
      // Create user with wallet-based email (no OTP required)
      const walletEmail = `${walletAddress.slice(0, 8)}@elevenx.bet`;
      const randomPassword = Math.random().toString(36).slice(-10);
      
      // Register the user
      const registerResponse = await base44.auth.register({
        email: walletEmail,
        password: randomPassword,
      });
      
      // Login immediately with the credentials
      const loginResponse = await base44.auth.loginViaEmailPassword(walletEmail, randomPassword);
      
      // Update user with wallet address and name
      await base44.auth.updateMe({
        wallet_address: walletAddress,
        full_name: fullName,
      });

      // Hard redirect to reload the app with new auth state
      window.location.href = '/';
    } catch (err) {
      console.error('Registration failed:', err);
      setError(err.message || 'Failed to register');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <AuthLayout
      icon={Wallet}
      title="Create Account"
      subtitle="Register with your Solana wallet"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        {step === 'wallet' ? (
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-center">
              <Wallet className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">Connect Your Wallet First</p>
              <p className="text-xs text-muted-foreground">We'll use your wallet address for authentication and payouts</p>
            </div>

            <Button
              onClick={handleConnectWallet}
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
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
              <p className="text-xs font-medium text-accent mb-1">Wallet Connected</p>
              <p className="text-xs text-muted-foreground font-mono">
                {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10 h-11 rounded-xl"
                />
              </div>
            </div>

            <Button
              onClick={handleRegister}
              disabled={isRegistering || !fullName}
              className="w-full h-12 font-heading font-bold rounded-xl text-sm"
              style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)', boxShadow: '0 0 16px rgba(166,156,242,0.25)' }}
            >
              {isRegistering ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>

            <Button
              onClick={() => setStep('wallet')}
              variant="outline"
              className="w-full h-11 rounded-xl"
            >
              Back
            </Button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}