import { base44 } from '@/api/base44Client';

/**
 * Call a backend function using wallet JWT auth (for wallet-only sessions).
 * This bypasses Base44 platform auth and uses the wallet auth token directly.
 */
export async function callFunctionWithWalletAuth(functionName, payload) {
  const authToken = localStorage.getItem('elevenx_auth_token');
  
  if (!authToken) {
    throw new Error('No wallet auth token found. Please connect your wallet first.');
  }

  // Get the function endpoint URL from Base44
  // Base44 functions are called via the SDK's internal endpoint
  // We'll use the SDK's invoke but inject the auth header manually
  
  // For wallet-only auth, we need to make a direct fetch call
  // The endpoint format is: /api/functions/{functionName}
  const response = await fetch(`/api/functions/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Check if wallet is admin by calling a lightweight endpoint
 */
export async function checkWalletAdmin() {
  const authToken = localStorage.getItem('elevenx_auth_token');
  
  if (!authToken) {
    return false;
  }

  try {
    // Decode JWT to get wallet address
    const parts = authToken.split('.');
    if (parts.length !== 3) return false;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const walletAddress = payload.walletAddress;
    
    if (!walletAddress) return false;
    
    // Check against WalletUser entity using service role via backend
    const result = await callFunctionWithWalletAuth('checkWalletBets', { wallet_address: walletAddress, check_admin_only: true });
    return result.isAdmin === true;
  } catch (err) {
    console.error('[WalletAuth] checkWalletAdmin error:', err);
    return false;
  }
}