import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WalletContext = createContext(null);

const WALLET_SESSION_KEY = 'elevenx_wallet_session';

export function WalletProvider({ children }) {
  const [walletAddress, setWalletAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Restore wallet session from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(WALLET_SESSION_KEY);
    if (saved) {
      console.log('[WalletContext] Restoring session:', saved);
      try {
        const parsed = JSON.parse(saved);
        const address = parsed.address || parsed;
        console.log('[WalletContext] Parsed address:', address);
        console.log('[WalletContext] Address length:', address?.length);
        // Validate Solana address format (base58, 32-44 chars)
        const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        const isValid = address && base58Regex.test(address);
        console.log('[WalletContext] Regex test result:', isValid);
        if (isValid) {
          console.log('[WalletContext] Setting wallet as connected:', address.slice(0, 8) + '...');
          setWalletAddress(address);
          setIsConnected(true);
        } else {
          // Clear corrupted address
          console.error('[WalletContext] Invalid address format, clearing');
          console.error('[WalletContext] Invalid chars:', address?.split('').filter(c => !/^[1-9A-HJ-NP-Za-km-z]$/.test(c)));
          localStorage.removeItem(WALLET_SESSION_KEY);
        }
      } catch (err) {
        console.error('[WalletContext] Failed to parse wallet session:', err);
        localStorage.removeItem(WALLET_SESSION_KEY);
      }
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
      
      // Validate Solana address format (base58, 32-44 chars)
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!base58Regex.test(address)) {
        console.error('Invalid wallet address from Phantom:', address);
        throw new Error('Invalid wallet address format');
      }
      
      console.log('Wallet connected:', address);
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
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}