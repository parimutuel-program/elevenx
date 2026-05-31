import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Wallet, X, ExternalLink, Zap, Shield, Globe } from 'lucide-react';

export default function ConnectWalletModal({ open, onClose }) {
  const { connect, isConnecting } = useWallet();

  const handleConnect = async () => {
    await connect();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(145deg, #1a1040 0%, #0f0a1e 100%)' }}
          >
            {/* Glow */}
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-25" style={{ background: '#a69cf2' }} />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-15" style={{ background: '#14f195' }} />

            <div className="relative z-10 p-7">
              <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors">
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center text-center mb-7">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mb-4">
                  <Wallet className="w-8 h-8 text-primary" />
                </div>
                <h2 className="font-heading font-black text-2xl text-white mb-2">Connect Wallet</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Connect your Phantom wallet to place bets on-chain. Your session is tied to your wallet.
                </p>
              </div>

              {/* Feature pills */}
              <div className="flex flex-col gap-2 mb-6">
                {[
                  { icon: Zap, text: 'Instant, gasless betting on Solana' },
                  { icon: Shield, text: 'Non-custodial — you own your funds' },
                  { icon: Globe, text: 'Session stored securely in browser' },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-xl px-4 py-3">
                    <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-xs text-white/70">{text}</span>
                  </div>
                ))}
              </div>

              {/* Connect button */}
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full h-12 font-heading font-bold text-base rounded-xl"
                style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)', boxShadow: '0 0 30px rgba(166,156,242,0.3)' }}
              >
                {isConnecting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <img src="https://phantom.app/favicon.ico" alt="Phantom" className="w-5 h-5 rounded" onError={e => e.target.style.display='none'} />
                    Connect Phantom
                  </div>
                )}
              </Button>

              <p className="text-center text-[11px] text-white/30 mt-3">
                Don't have Phantom?{' '}
                <a href="https://phantom.app" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  Get it here <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}