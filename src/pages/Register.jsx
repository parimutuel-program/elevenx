import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';

export default function Register() {
  const [isConnecting, setIsConnecting] = useState(false);
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
      setError('Phantom wallet not found. Please install it.');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      const resp = await phantom.connect();
      const address = resp.publicKey.toString();
      
      // Register wallet (auto-creates user if doesn't exist)
      const response = await base44.functions.invoke('walletAuth', {
        walletAddress: address,
        register: true
      });

      if (response.data.success || response.data.exists) {
        // Redirect to login for auto-authentication
        window.location.href = `/login?wallet=${address}&registered=true`;
        return;
      }
    } catch (err) {
      console.error('Registration failed:', err);
      setError(err.message || 'Failed to register');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <AuthLayout
      icon={Wallet}
      title="Get Started"
      subtitle="Connect your wallet to start betting"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

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

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Already have an account?{' '}
            <a href="/login" className="text-primary hover:underline">Login here</a>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}