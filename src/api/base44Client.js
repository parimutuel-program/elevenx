import { createClient } from '@base44/sdk';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Get wallet auth token from localStorage if available
const getWalletAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('elevenx_auth_token');
};

// Create axios client with wallet auth token if available
const createBase44AxiosClient = () => {
  const walletToken = getWalletAuthToken();
  const authToken = walletToken || token;
  
  return createAxiosClient({
    baseURL: '',
    headers: {
      'X-App-Id': appId,
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
    },
  });
};

//Create a client with authentication
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
  axiosClient: createBase44AxiosClient(),
});