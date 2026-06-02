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
      // Phantom's connect() returns { publicKey: PublicKey } directly
      const { publicKey } = await phantom.connect();
      
      // Handle publicKey - it's a PublicKey object with toBase58() method
      let address;
      if (publicKey && typeof publicKey.toBase58 === 'function') {
        address = publicKey.toBase58();
      } else if (publicKey && typeof publicKey.toString === 'function') {
        address = publicKey.toString();
      } else {
        address = String(publicKey);
      }
      
      // Trim and clean the address
      address = address.trim();
      console.log('[WalletContext] Raw address from Phantom:', address);
      console.log('[WalletContext] Address type:', typeof address);
      console.log('[WalletContext] Address length:', address.length);
      
      // Validate Solana address format (base58, 32-44 chars)
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!base58Regex.test(address)) {
        console.error('[WalletContext] Invalid wallet address from Phantom:', address);
        const invalidChars = address.split('').filter(c => !/^[1-9A-HJ-NP-Za-km-z]$/.test(c));
        console.error('[WalletContext] Invalid characters:', invalidChars.map((c, i) => `pos${i}:'${c}'(code${c.charCodeAt(0)})`));
        throw new Error('Invalid wallet address format — contains non-base58 characters. Invalid: ' + invalidChars.join(', '));
      }
      
      console.log('[WalletContext] Wallet connected:', address.slice(0, 8) + '...');
      setWalletAddress(address);
      setIsConnected(true);
      localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({ address, connectedAt: Date.now() }));
      
      // Auto-register wallet with backend (creates user if doesn't exist)
      try {
        const { base44 } = await import('@/api/base44Client');
        console.log('[WalletContext] Calling walletAuth to register/check user...');
        const authRes = await base44.functions.invoke('walletAuth', {
          walletAddress: address,
          register: true,
        });
        console.log('[WalletContext] walletAuth response:', authRes.data);
        
        if (authRes.data.isNewUser) {
          console.log('[WalletContext] New user registered:', authRes.data.userId);
        } else {
          console.log('[WalletContext] Existing user:', authRes.data.userId);
        }
      } catch (err) {
        console.error('[WalletContext] walletAuth failed:', err);
        // Don't block connection - user can still bet, just won't have DB record
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
        // Handle PublicKey object or string
        let address;
        if (typeof publicKey.toBase58 === 'function') {
          address = publicKey.toBase58();
        } else if (typeof publicKey.toString === 'function') {
          address = publicKey.toString();
        } else {
          address = String(publicKey);
        }
        
        console.log('[WalletContext] Account changed:', address);
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