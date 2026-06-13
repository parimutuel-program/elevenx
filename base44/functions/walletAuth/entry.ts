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

    // MANDATORY: Signature verification is now required for security
    if (!signature || !message) {
      console.log('walletAuth rejected - missing signature (security requirement)');
      return Response.json({ error: 'Cryptographic signature is mandatory for authentication' }, { status: 401 });
    }

    console.log('walletAuth called - walletAddress:', walletAddress?.slice(0, 8), 'register:', register);

    // Verify the cryptographic signature
    try {
      const publicKey = bs58.decode(walletAddress);
      const signatureBytes = bs58.decode(signature);
      const messageBytes = new TextEncoder().encode(message);
      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
      if (!isValid) {
        console.log('Signature verification FAILED for wallet:', walletAddress?.slice(0, 8));
        return Response.json({ error: 'Invalid cryptographic signature' }, { status: 401 });
      }
      console.log('✓ Signature verified successfully for wallet:', walletAddress?.slice(0, 8));
    } catch (sigErr) {
      console.log('Signature check error:', sigErr.message);
      return Response.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    // Check if user exists by wallet address using WalletUser entity (avoids auth issues)
    let walletUser = null;
    try {
      console.log('Looking up walletUser by wallet:', walletAddress?.slice(0, 8));
      const walletUsers = await serviceRole.entities.WalletUser.filter({ 
        wallet_address: walletAddress 
      });
      walletUser = walletUsers[0];
      
      if (walletUser) {
        console.log('✓ Found walletUser - wallet:', walletUser.wallet_address);
      } else {
        console.log('WalletUser lookup - no matching wallet found');
      }
    } catch (err) {
      console.log('WalletUser lookup failed:', err.message);
      walletUser = null;
    }
    
    // If walletUser exists, also get the User entity record
    let user = null;
    if (walletUser) {
      try {
        const users = await serviceRole.entities.User.filter({ wallet_address: walletAddress });
        user = users[0];
        if (user) {
          console.log('✓ Found user - id:', user.id, 'wallet:', user.wallet_address);
        } else {
          console.log('⚠️ WalletUser exists but User entity missing - will create User');
        }
      } catch (err) {
        console.log('User lookup failed:', err.message);
      }
    }

    // Ensure both WalletUser and User records exist (auto-create if missing)
    console.log('Ensuring User entity exists for wallet:', walletAddress?.slice(0, 8));
    
    try {
      // Create WalletUser record if it doesn't exist
      if (!walletUser) {
        walletUser = await serviceRole.entities.WalletUser.create({
          wallet_address: walletAddress,
          username: walletAddress.slice(0, 8),
        });
        console.log('✓ WalletUser created - wallet:', walletAddress);
      }
      
      // Create User entity record for platform auth if it doesn't exist
      if (!user) {
        user = await serviceRole.entities.User.create({
          email: `${walletAddress.slice(0, 8)}@elevenx.bet`,
          full_name: `User ${walletAddress.slice(0, 8)}`,
          wallet_address: walletAddress,
          username: walletAddress.slice(0, 8),
          role: 'user',
        });
        console.log('✓ User created - id:', user.id, 'wallet:', walletAddress);
      } else {
        console.log('✓ User already exists - id:', user.id);
      }
    } catch (createErr) {
      console.error('✗ User creation failed:', createErr);
      return Response.json({ error: 'Failed to create user: ' + createErr.message }, { status: 500 });
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
    const userWallet = walletUser.wallet_address;
    
    // Ensure user has username set (for display)
    if (!walletUser.username && userWallet) {
      walletUser.username = walletUser.full_name || `User_${userWallet.slice(0, 8)}`;
    }
    
    // Grant admin role to specific wallet address
    const ADMIN_WALLET = '4xfwNAkxNbgZuR5LsjTh91z9Sw3d9AVvHvbPpTaiipZZ';
    const effectiveRole = (userWallet === ADMIN_WALLET) ? 'admin' : (walletUser.role || 'user');
    
    const tokenPayload = {
      userId: walletUser.id,
      walletAddress: userWallet,
      role: effectiveRole,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
    };

    // Create a simple signed token (HMAC-SHA256) with base64url encoding for frontend compatibility
    const encoder = new TextEncoder();
    // Use base64url (remove padding)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '');
    const payload = btoa(JSON.stringify(tokenPayload)).replace(/=+$/, '');
    
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
    
    // Use base64url for signature (replace + with -, / with _, remove =)
    const tokenSignature = btoa(String.fromCharCode(...new Uint8Array(signatureData)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const token = `${header}.${payload}.${tokenSignature}`;

    console.log('✓ User authenticated - token generated for userId:', walletUser.id);
    
    return Response.json({
      success: true,
      userId: walletUser.id,
      walletAddress: userWallet,
      role: walletUser.role,
      username: walletUser.username || walletUser.full_name,
      email: walletUser.email,
      authToken: token,
      isNewUser: !!(register && walletUser.created_date === walletUser.updated_date),
    });

  } catch (error) {
    console.error('walletAuth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});