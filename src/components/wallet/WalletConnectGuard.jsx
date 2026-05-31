import React from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Wallet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function WalletConnectGuard({ children, showConnectButton = true }) {
  const { isConnected, connect, isConnecting } = useWallet();

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-2xl p-8 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-heading font-bold text-lg mb-2">Connect Wallet to Continue</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          You need to connect your Solana wallet to place bets, view your positions, and claim winnings.
        </p>
        
        {showConnectButton && (
          <Button
            onClick={connect}
            disabled={isConnecting}
            className="font-heading font-bold rounded-xl h-11 px-8"
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
                Connect Phantom
              </>
            )}
          </Button>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-3 h-3" />
          <span>Secure · Decentralized · Non-custodial</span>
        </div>
      </motion.div>
    );
  }

  return <>{children}</>;
}