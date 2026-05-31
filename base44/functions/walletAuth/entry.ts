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

    // Check if user exists in the system
    let user = await base44.entities.User.filter({ wallet_address: walletAddress }).then(users => users[0] || null);

    if (!user) {
      // User doesn't exist - we'll create them via the platform's invite system
      // For now, return that user needs to be registered
      return Response.json({ 
        error: 'User not registered',
        needsRegistration: true,
        walletAddress 
      }, { status: 404 });
    }

    // User exists - generate a session token
    // In a real implementation, you'd use the platform's token system
    return Response.json({
      success: true,
      user: {
        id: user.id,
        walletAddress: user.wallet_address,
        role: user.role,
        full_name: user.full_name,
        email: user.email
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});