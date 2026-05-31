import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { walletAddress, signature, message, fullName, register } = await req.json();

    if (!walletAddress) {
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    // If signature provided, verify it
    if (signature && message) {
      const publicKey = bs58.decode(walletAddress);
      const signatureBytes = bs58.decode(signature);
      const messageBytes = new TextEncoder().encode(message);

      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);

      if (!isValid) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Check if user exists by wallet address (use service role for unauthenticated endpoint)
    let users = await base44.asServiceRole.entities.User.filter({ wallet_address: walletAddress });
    let user = users[0] || null;

    // If registering and user doesn't exist, create user with service role
    if (register && !user && fullName) {
      const walletEmail = `${walletAddress.slice(0, 8)}@elevenx.bet`;
      const tempPassword = Math.random().toString(36).slice(-10);
      
      // Create user using service role (bypasses email/password auth requirement)
      const newUser = await base44.asServiceRole.entities.User.create({
        email: walletEmail,
        full_name: fullName,
        wallet_address: walletAddress,
        role: 'user',
      });
      
      // Return credentials for frontend to login
      return Response.json({
        success: true,
        needsRegistration: false,
        user: {
          id: newUser.id,
          email: newUser.email,
          full_name: newUser.full_name,
          wallet_address: newUser.wallet_address,
          role: newUser.role
        },
        walletAddress,
        isNewUser: true,
        email: walletEmail,
        password: tempPassword
      });
    }

    if (!user) {
      // User doesn't exist - return that user needs to be registered
      return Response.json({ 
        needsRegistration: true,
        walletAddress 
      }, { status: 404 });
    }

    // User exists - return user info
    return Response.json({
      success: true,
      userId: user.id,
      walletAddress: user.wallet_address,
      role: user.role,
      full_name: user.full_name
    });

  } catch (error) {
    console.error('walletAuth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});