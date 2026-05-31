import React, { useState } from 'react';
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

  const handleWalletLogin = async () => {
    const phantom = getPhantom();
    
    if (!phantom) {
      window.open('https://phantom.app/', '_blank');
      setError('Phantom wallet not found. Please install it.');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      // Connect to wallet
      const resp = await phantom.connect();
      const walletAddress = resp.publicKey.toString();

      // Create a message to sign
      const message = `Sign in to ElevenX\n\nWallet: ${walletAddress}\n\nNonce: ${Date.now()}`;
      const encodedMessage = new TextEncoder().encode(message);

      // Request signature
      const signature = await phantom.signMessage(encodedMessage, 'utf8');
      const signatureBase58 = signature.signature;

      // Verify signature with backend
      const response = await base44.functions.invoke('walletAuth', {
        walletAddress,
        signature: signatureBase58,
        message
      });

      if (response.data.needsRegistration) {
        setError('Wallet not registered. Please contact admin or register first.');
        await phantom.disconnect();
        return;
      }

      // Success - set token and reload
      if (response.data.success) {
        // In production, you'd receive a JWT token here
        // For now, use the platform's auth
        await checkUserAuth();
        window.location.href = '/';
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
        </div>
      </div>
    </AuthLayout>
  );
}