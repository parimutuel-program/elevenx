import React, { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Button } from '@/components/ui/button';
import { Wallet, ChevronDown, LogOut, Copy } from 'lucide-react';
import ConnectWalletModal from './ConnectWalletModal';

export default function WalletButton() {
  const { isConnected, shortAddress, disconnect, isConnecting } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const { walletAddress } = useWallet();

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setShowDropdown(false);
  };

  if (!isConnected) {
    return (
      <>
        <Button
          onClick={() => setShowModal(true)}
          disabled={isConnecting}
          size="sm"
          className="font-heading font-bold rounded-xl text-xs h-9 px-4"
          style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)', boxShadow: '0 0 16px rgba(166,156,242,0.25)' }}
        >
          <Wallet className="w-3.5 h-3.5 mr-1.5" />
          Connect Wallet
        </Button>
        <ConnectWalletModal open={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 bg-primary/10 border border-primary/25 hover:bg-primary/20 transition-colors rounded-xl px-3 py-2"
      >
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="font-heading font-bold text-xs text-primary">{shortAddress}</span>
        <ChevronDown className="w-3 h-3 text-primary/60" />
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full mt-2 w-44 bg-card border border-border/60 rounded-2xl shadow-xl z-50 overflow-hidden">
            <button
              onClick={copyAddress}
              className="w-full flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy Address'}
            </button>
            <button
              onClick={() => { disconnect(); setShowDropdown(false); }}
              className="w-full flex items-center gap-2 px-4 py-3 text-xs text-destructive hover:bg-destructive/10 transition-colors border-t border-border/30"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}