import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { walletAddress, signature, message } = await req.json();

    if (!walletAddress || !signature || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the signature
    const publicKey = bs58.decode(walletAddress);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);

    if (!isValid) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Check if user exists by wallet address
    let users = await base44.entities.User.filter({ wallet_address: walletAddress });
    let user = users[0] || null;

    if (!user) {
      // User doesn't exist - return that user needs to be registered
      return Response.json({ 
        error: 'User not registered',
        needsRegistration: true,
        walletAddress 
      }, { status: 404 });
    }

    // User exists - return user info
    // The frontend will use base44.auth.setToken() to establish session
    return Response.json({
      success: true,
      userId: user.id,
      walletAddress: user.wallet_address,
      role: user.role,
      needsToken: true
    });

  } catch (error) {
    console.error('walletAuth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});