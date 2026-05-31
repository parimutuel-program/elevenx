import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WalletContext = createContext();

const WALLET_SESSION_KEY = 'elevenx_wallet_session';

export const WalletProvider = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(WALLET_SESSION_KEY);
    if (saved) {
      try {
        const { address } = JSON.parse(saved);
        if (address) {
          setWalletAddress(address);
          setIsConnected(true);
        }
      } catch {}
    }
  }, []);

  const getPhantom = () => {
    if (typeof window !== 'undefined' && window.solana?.isPhantom) {
      return window.solana;
    }
    return null;
  };

  const connect = useCallback(async () => {
    const phantom = getPhantom();
    if (!phantom) {
      window.open('https://phantom.app/', '_blank');
      return;
    }
    setIsConnecting(true);
    try {
      const resp = await phantom.connect();
      const address = resp.publicKey.toString();
      setWalletAddress(address);
      setIsConnected(true);
      localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({ address, connectedAt: Date.now() }));
      
      // Save to backend user profile only if user is authenticated
      try {
        const { base44 } = await import('@/api/base44Client');
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (isAuthenticated) {
          await base44.functions.invoke('saveWalletAddress', { walletAddress: address });
        }
      } catch (err) {
        console.error('Failed to save wallet to profile:', err);
      }
    } catch (err) {
      console.error('Wallet connect failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const phantom = getPhantom();
    if (phantom) {
      try { await phantom.disconnect(); } catch {}
    }
    setWalletAddress(null);
    setIsConnected(false);
    localStorage.removeItem(WALLET_SESSION_KEY);
  }, []);

  // Listen for wallet account changes / disconnects
  useEffect(() => {
    const phantom = getPhantom();
    if (!phantom) return;

    const handleDisconnect = () => {
      setWalletAddress(null);
      setIsConnected(false);
      localStorage.removeItem(WALLET_SESSION_KEY);
    };

    const handleAccountChange = (publicKey) => {
      if (publicKey) {
        const address = publicKey.toString();
        setWalletAddress(address);
        localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({ address, connectedAt: Date.now() }));
      } else {
        handleDisconnect();
      }
    };

    phantom.on('disconnect', handleDisconnect);
    phantom.on('accountChanged', handleAccountChange);

    return () => {
      phantom.off?.('disconnect', handleDisconnect);
      phantom.off?.('accountChanged', handleAccountChange);
    };
  }, []);

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <WalletContext.Provider value={{
      walletAddress,
      shortAddress,
      isConnected,
      isConnecting,
      connect,
      disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
};