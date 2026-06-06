import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import bs58 from 'bs58';

const WalletContext = createContext(null);

const WALLET_SESSION_KEY = 'elevenx_wallet_session';

// Helper to normalize and validate wallet addresses
const normalizeWalletAddress = (addr) => {
  if (!addr || typeof addr !== 'string') return null;
  const trimmed = addr.trim();
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!base58Regex.test(trimmed)) {
    console.error('[WalletContext] Invalid address format:', trimmed.slice(0, 8) + '...');
    return null;
  }
  return trimmed;
};

export function WalletProvider({ children }) {
  const [walletAddress, setWalletAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Restore wallet session from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(WALLET_SESSION_KEY);
    console.log('[WalletContext] localStorage key:', WALLET_SESSION_KEY);
    console.log('[WalletContext] Saved value:', saved);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const address = normalizeWalletAddress(parsed.address || parsed);
        console.log('[WalletContext] Parsed address:', address);
        if (address) {
          console.log('[WalletContext] Restored session:', address.slice(0, 8) + '...');
          setWalletAddress(address);
          setIsConnected(true);
        } else {
          console.log('[WalletContext] Address normalization failed');
          localStorage.removeItem(WALLET_SESSION_KEY);
        }
      } catch (err) {
        console.error('[WalletContext] Failed to parse wallet session:', err);
        localStorage.removeItem(WALLET_SESSION_KEY);
      }
    } else {
      console.log('[WalletContext] No saved wallet session found');
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
      const { publicKey } = await phantom.connect();
      let address = publicKey?.toBase58?.() || publicKey?.toString?.() || String(publicKey);
      address = normalizeWalletAddress(address);
      
      if (!address) {
        throw new Error('Invalid wallet address from Phantom');
      }
      
      console.log('[WalletContext] Wallet connected:', address.slice(0, 8) + '...');
      setWalletAddress(address);
      setIsConnected(true);
      localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({ address, connectedAt: Date.now() }));
      localStorage.setItem('elevenx_auth_token', ''); // Clear old token, will be set by walletAuth
      
      // Generate challenge and request signature for secure auth
      const challenge = `Sign to authenticate with ElevenX\n\nWallet: ${address}\nNonce: ${Date.now()}`;
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(challenge);
      const { signature } = await phantom.signMessage(messageBytes, 'utf8');
      
      // Auto-register wallet with backend and get auth token (with mandatory signature)
      const { base44 } = await import('@/api/base44Client');
      const authRes = await base44.functions.invoke('walletAuth', {
        walletAddress: address,
        signature: bs58.encode(signature),
        message: challenge,
        register: true,
      });
      
      if (authRes.data.authToken) {
        localStorage.setItem('elevenx_auth_token', authRes.data.authToken);
        console.log('[WalletContext] Auth token stored');
        // Hard reload to ensure all auth state is fresh
        window.location.reload();
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

    const handleAccountChange = async (publicKey) => {
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
        
        // Auto-register/authenticate the new wallet with signature
        try {
          const { base44 } = await import('@/api/base44Client');
          const phantom = getPhantom();
          console.log('[WalletContext] Calling walletAuth for new account...');
          
          // Generate challenge and request signature
          const challenge = `Sign to authenticate with ElevenX\n\nWallet: ${address}\nNonce: ${Date.now()}`;
          const encoder = new TextEncoder();
          const messageBytes = encoder.encode(challenge);
          const { signature } = await phantom.signMessage(messageBytes, 'utf8');
          
          const authRes = await base44.functions.invoke('walletAuth', {
            walletAddress: address,
            signature: bs58.encode(signature),
            message: challenge,
            register: true,
          });
          console.log('[WalletContext] walletAuth response:', authRes.data);
          
          if (authRes.data.authToken) {
            localStorage.setItem('elevenx_auth_token', authRes.data.authToken);
            console.log('[WalletContext] Auth token stored for new account');
          }
        } catch (err) {
          console.error('[WalletContext] walletAuth failed on account change:', err);
        }
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