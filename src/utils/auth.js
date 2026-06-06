/**
 * Extract wallet address from auth token payload
 * This is the PERMANENT source of truth for wallet - not localStorage
 */
export const getWalletFromAuth = () => {
  try {
    const authToken = localStorage.getItem('elevenx_auth_token');
    if (!authToken) {
      console.log('[getWalletFromAuth] No auth token found');
      return null;
    }

    // Decode JWT-like token (header.payload.signature)
    const parts = authToken.split('.');
    if (parts.length !== 3) {
      console.error('[getWalletFromAuth] Invalid token format');
      return null;
    }

    // Decode payload (base64url)
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const payload = JSON.parse(jsonPayload);

    console.log('[getWalletFromAuth] Token payload:', {
      userId: payload.userId,
      walletAddress: payload.walletAddress?.slice(0, 8) + '...',
      role: payload.role,
    });

    return payload.walletAddress || null;
  } catch (err) {
    console.error('[getWalletFromAuth] Failed to decode auth token:', err.message);
    return null;
  }
};

/**
 * Get current user's wallet address with fallback chain:
 * 1. Auth token (primary - most reliable)
 * 2. WalletContext (if available)
 * 3. localStorage session (legacy fallback)
 */
export const getCurrentWallet = (walletContextAddress) => {
  // Priority 1: Auth token (this is the source of truth)
  const walletFromToken = getWalletFromAuth();
  if (walletFromToken) {
    console.log('[getCurrentWallet] Using wallet from auth token:', walletFromToken.slice(0, 8) + '...');
    return walletFromToken;
  }

  // Priority 2: WalletContext (if passed)
  if (walletContextAddress) {
    console.log('[getCurrentWallet] Using wallet from WalletContext:', walletContextAddress.slice(0, 8) + '...');
    return walletContextAddress;
  }

  // Priority 3: localStorage session (legacy fallback)
  const walletSession = localStorage.getItem('elevenx_wallet_session');
  if (walletSession) {
    try {
      const parsed = JSON.parse(walletSession);
      const legacyWallet = parsed.address || parsed;
      console.log('[getCurrentWallet] Using legacy wallet from localStorage:', legacyWallet.slice(0, 8) + '...');
      return legacyWallet;
    } catch {
      console.log('[getCurrentWallet] Failed to parse localStorage session');
    }
  }

  console.log('[getCurrentWallet] No wallet found');
  return null;
};