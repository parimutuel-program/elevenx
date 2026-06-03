import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5.0.0';
import { subtle } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const { walletAddress, signature, message, username, register } = await req.json();

    if (!walletAddress) {
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    console.log('walletAuth called - walletAddress:', walletAddress, 'register:', register);

    // If signature provided, verify it
    if (signature && message) {
      try {
        const publicKey = bs58.decode(walletAddress);
        const signatureBytes = bs58.decode(signature);
        const messageBytes = new TextEncoder().encode(message);
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
        if (!isValid) {
          console.log('Signature verification failed');
          return Response.json({ error: 'Invalid signature' }, { status: 401 });
        }
        console.log('Signature verified successfully');
      } catch (sigErr) {
        console.log('Signature check error:', sigErr.message);
        return Response.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    }

    // Check if user exists by wallet address
    let user = null;
    try {
      console.log('Looking up user by wallet:', walletAddress?.slice(0, 8));
      // List all users and find by wallet_address (filter doesn't work reliably)
      const allUsers = await serviceRole.entities.User.list();
      user = allUsers.find(u => u.wallet_address === walletAddress || u.data?.wallet_address === walletAddress);
      
      if (user) {
        console.log('✓ Found user - id:', user.id, 'wallet:', user.wallet_address || user.data?.wallet_address);
        
        // Ensure WalletUser record exists (create if missing for existing users)
        const userWallet = user.wallet_address || user.data?.wallet_address;
        const allWalletUsers = await serviceRole.entities.WalletUser.list();
        const walletUserExists = allWalletUsers.find(wu => wu.wallet_address === userWallet);
        
        if (!walletUserExists && userWallet) {
          try {
            await serviceRole.entities.WalletUser.create({
              wallet_address: userWallet,
            });
            console.log('✓ Created WalletUser record for existing user:', user.id);
          } catch (wuErr) {
            console.error('Failed to create WalletUser record:', wuErr.message);
          }
        }
      } else {
        console.log('User lookup - no matching user found');
      }
    } catch (err) {
      console.log('User lookup failed:', err.message);
      user = null;
    }

    // If registering, auto-create user with wallet address as identifier
    if (register && !user) {
      console.log('Registering user - wallet:', walletAddress);
      
      try {
        // Create user with wallet_address at root level (matches User entity schema)
        // full_name is a built-in required field for User entity
        user = await serviceRole.entities.User.create({
          email: `${walletAddress.slice(0, 8)}@elevenx.bet`,
          full_name: `User ${walletAddress.slice(0, 8)}`,
          wallet_address: walletAddress,
          username: walletAddress.slice(0, 8),
          role: 'user',
        });
        
        // Also create WalletUser record for betting authorization
        await serviceRole.entities.WalletUser.create({
          wallet_address: walletAddress,
        });
        
        console.log('✓ User created - id:', user.id, 'wallet:', walletAddress);
      } catch (createErr) {
        console.error('✗ User creation failed:', createErr);
        return Response.json({ error: 'Failed to create user: ' + createErr.message }, { status: 500 });
      }
    }

    // If no user found and not registering
    if (!user) {
      console.log('No user found, needs registration');
      return Response.json({ 
        needsRegistration: true,
        walletAddress 
      });
    }

    // Generate a JWT-like token for wallet-based auth
    // This token will be stored in localStorage and used for auth
    const userWallet = user.wallet_address || user.data?.wallet_address;
    
    // Ensure user has username set (for display)
    if (!user.username && userWallet) {
      user.username = user.full_name || `User_${userWallet.slice(0, 8)}`;
    }
    const tokenPayload = {
      userId: user.id,
      walletAddress: userWallet,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    };

    // Create a simple signed token (HMAC-SHA256)
    const encoder = new TextEncoder();
    const header = bs58.encode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const payload = bs58.encode(encoder.encode(JSON.stringify(tokenPayload)));
    
    // Get secret key from env or use app ID
    const secretKey = Deno.env.get('BASE44_APP_ID') || 'elevenx-secret';
    const keyData = encoder.encode(secretKey);
    
    const key = await subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureData = await subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${header}.${payload}`)
    );
    
    const tokenSignature = bs58.encode(new Uint8Array(signatureData));

    const token = `${header}.${payload}.${tokenSignature}`;

    console.log('✓ User authenticated - token generated for userId:', user.id);
    
    return Response.json({
      success: true,
      userId: user.id,
      walletAddress: userWallet,
      role: user.role,
      username: user.username || user.full_name,
      email: user.email,
      authToken: token,
      isNewUser: !!(register && user.created_date === user.updated_date),
    });

  } catch (error) {
    console.error('walletAuth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});