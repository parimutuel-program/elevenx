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
  
  console.log('[callBackendFunction] Calling:', functionName, 'with payload:', payload);
  console.log('[callBackendFunction] Auth token exists:', !!authToken, 'length:', authToken?.length);
  console.log('[callBackendFunction] Full URL:', `/api/functions/${functionName}`);
  
  let response;
  try {
    response = await fetch(`/api/functions/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    console.error('[callBackendFunction] Network error:', networkErr);
    throw new Error('Network error - cannot reach backend. Please check your connection.');
  }
  
  console.log('[callBackendFunction] Response status:', response.status, response.ok);
  console.log('[callBackendFunction] Response headers:', Object.fromEntries(response.headers.entries()));
  
  // Try to read response body
  const responseText = await response.text();
  console.log('[callBackendFunction] Raw response text:', responseText);
  
  if (!responseText) {
    throw new Error(`Empty response from server (HTTP ${response.status})`);
  }
  
  let responseData;
  try {
    responseData = JSON.parse(responseText);
    console.log('[callBackendFunction] Parsed response data:', responseData);
  } catch (parseErr) {
    console.error('[callBackendFunction] Failed to parse JSON:', parseErr);
    throw new Error(`Invalid JSON from server: ${responseText.slice(0, 200)}`);
  }
  
  if (!response.ok) {
    throw new Error(responseData?.error || `HTTP ${response.status}`);
  }
  
  return responseData;
}