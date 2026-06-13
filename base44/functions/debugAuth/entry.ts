import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    // Debug: Log ALL headers to see what's being sent
    const allHeaders = {};
    req.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });
    
    console.log('[debugAuth] ALL HEADERS:', JSON.stringify(allHeaders, null, 2));
    
    // Try to get auth from multiple sources
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    
    console.log('[debugAuth] Authorization header:', authHeader ? authHeader.slice(0, 50) + '...' : 'MISSING');
    console.log('[debugAuth] Token extracted:', token ? token.slice(0, 20) + '...' : 'NONE');
    
    // Decode token if present
    let tokenPayload = null;
    if (token && token.split('.').length === 3) {
      try {
        tokenPayload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        console.log('[debugAuth] Token payload:', {
          walletAddress: tokenPayload.walletAddress?.slice(0, 8),
          role: tokenPayload.role,
          userId: tokenPayload.userId,
        });
      } catch (e) {
        console.log('[debugAuth] Could not decode token:', e.message);
      }
    }
    
    // Check admin status
    const ADMIN_WALLET = '4xfwNAkxNbgZuR5LsjTh91z9Sw3d9AVvHvbPpTaiipZZ';
    const isAdminWallet = tokenPayload?.walletAddress === ADMIN_WALLET;
    const isAdminRole = tokenPayload?.role === 'admin';
    
    return Response.json({
      headers_received: Object.keys(allHeaders),
      has_authorization: !!authHeader,
      token_length: token?.length || 0,
      token_payload: tokenPayload ? {
        wallet: tokenPayload.walletAddress?.slice(0, 8),
        role: tokenPayload.role,
      } : null,
      is_admin_wallet: isAdminWallet,
      is_admin_role: isAdminRole,
      can_access: isAdminWallet || isAdminRole,
    });
    
  } catch (error) {
    console.error('debugAuth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});