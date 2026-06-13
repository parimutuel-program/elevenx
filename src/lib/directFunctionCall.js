/**
 * Direct HTTP client for calling backend functions with wallet JWT.
 * Bypasses Base44 SDK auth requirements for wallet-only sessions.
 */

/**
 * Call a backend function directly via HTTP with wallet JWT auth token.
 * @param {string} functionName - Name of the backend function to call
 * @param {object} payload - Function parameters
 * @returns {Promise<any>} Function response data
 */
export async function callBackendFunction(functionName, payload) {
  const authToken = localStorage.getItem('elevenx_auth_token');
  const walletSession = localStorage.getItem('elevenx_wallet_session');
  const walletAddress = walletSession ? JSON.parse(walletSession).address : null;
  
  if (!authToken) {
    throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
  }
  
  console.log('[callBackendFunction] Calling:', functionName);
  console.log('[callBackendFunction] Token length:', authToken?.length);
  console.log('[callBackendFunction] Wallet address:', walletAddress?.slice(0, 8));
  
  // Send token in BOTH header and body (fallback if platform strips headers)
  let response;
  try {
    response = await fetch(`/api/functions/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Wallet-Token': authToken, // Fallback header
      },
      body: JSON.stringify({
        ...payload,
        _auth_token: authToken, // Fallback in body
      }),
    });
  } catch (networkErr) {
    console.error('[callBackendFunction] Network error:', networkErr);
    throw new Error('Network error - cannot reach backend. Please check your connection.');
  }
  
  console.log('[callBackendFunction] Response status:', response.status);
  
  const responseText = await response.text();
  console.log('[callBackendFunction] Raw response:', responseText.slice(0, 500));
  
  if (!responseText) {
    throw new Error(`Empty response (HTTP ${response.status})`);
  }
  
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (parseErr) {
    throw new Error(`Invalid JSON: ${responseText.slice(0, 200)}`);
  }
  
  if (!response.ok) {
    throw new Error(responseData?.error || `HTTP ${response.status}`);
  }
  
  return responseData;
}