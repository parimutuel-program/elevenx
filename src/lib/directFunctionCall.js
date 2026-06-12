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
  
  if (!authToken) {
    throw new Error('Wallet not connected. Please connect your Phantom wallet first.');
  }
  
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
  
  return response.json();
}