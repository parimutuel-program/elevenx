import { createClient } from '@base44/sdk';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Get wallet auth token from localStorage if available
const getWalletAuthToken = () => {
  if (typeof window === 'undefined') return null;
  const walletToken = localStorage.getItem('elevenx_auth_token');
  return walletToken;
};

// Create axios client with CURRENT wallet auth token (called on each request)
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

// Create a client factory that gets a fresh client with current auth on each invoke
const createBase44Client = () => {
  return createClient({
    appId,
    token,
    functionsVersion,
    serverUrl: '',
    requiresAuth: false,
    appBaseUrl,
    axiosClient: createBase44AxiosClient(),
  });
};

// Export a proxy object that intercepts function invokes to use fresh auth
export const base44 = {
  entities: {},
  functions: {
    invoke: async (functionName, params) => {
      const client = createBase44Client();
      return client.functions.invoke(functionName, params);
    },
  },
  auth: {
    me: async () => {
      const client = createBase44Client();
      return client.auth.me();
    },
    isAuthenticated: async () => {
      const client = createBase44Client();
      return client.auth.isAuthenticated();
    },
    logout: (redirectUrl) => {
      const client = createBase44Client();
      return client.auth.logout(redirectUrl);
    },
    updateMe: (data) => {
      const client = createBase44Client();
      return client.auth.updateMe(data);
    },
  },
  users: {
    inviteUser: (email, role) => {
      const client = createBase44Client();
      return client.users.inviteUser(email, role);
    },
  },
  integrations: {},
};

// Also export direct access to entities for queries (these also need fresh auth)
const getEntityProxy = () => {
  return new Proxy({}, {
    get: (target, entityName) => {
      return {
        list: async (sort, limit) => {
          const client = createBase44Client();
          return client.entities[entityName].list(sort, limit);
        },
        filter: async (query, sort, limit) => {
          const client = createBase44Client();
          return client.entities[entityName].filter(query, sort, limit);
        },
        create: async (data) => {
          const client = createBase44Client();
          return client.entities[entityName].create(data);
        },
        update: async (id, data) => {
          const client = createBase44Client();
          return client.entities[entityName].update(id, data);
        },
        delete: async (id) => {
          const client = createBase44Client();
          return client.entities[entityName].delete(id);
        },
      };
    },
  });
};

base44.entities = getEntityProxy();