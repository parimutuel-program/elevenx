import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const serviceRole = base44.asServiceRole;
    
    const { walletAddress, signature, message, username, register } = await req.json();

    if (!walletAddress) {
      return Response.json({ error: 'Missing wallet address' }, { status: 400 });
    }

    console.log('walletAuth called - walletAddress:', walletAddress, 'register:', register, 'username:', username || 'N/A');

    // If signature provided, verify it
    if (signature && message) {
      try {
        const publicKey = bs58.decode(walletAddress);
        const signatureBytes = bs58.decode(signature);
        const messageBytes = new TextEncoder().encode(message);
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
        if (!isValid) {
          console.log('Signature verification failed');
        } else {
          console.log('Signature verified successfully');
        }
      } catch (sigErr) {
        console.log('Signature check error:', sigErr.message);
      }
    }

    // Check if user exists by wallet address
    let user = null;
    try {
      console.log('Looking up user by wallet:', walletAddress?.slice(0, 8));
      const users = await serviceRole.entities.User.filter({ wallet_address: walletAddress });
      console.log('User lookup - found:', users?.length || 0, 'users');
      if (users && users.length > 0) {
        user = users[0];
        console.log('✓ Found user - full_name:', user.full_name, 'username:', user.username);
      }
    } catch (err) {
      console.log('User lookup failed:', err.message);
      user = null;
    }

    // If registering, create user
    if (register && username) {
      console.log('Registering user - username:', username);
      
      // Check if username is already taken
      let usernameTaken = false;
      try {
        const existingUsers = await serviceRole.entities.User.filter({ username: username });
        if (existingUsers && existingUsers.length > 0) {
          usernameTaken = true;
          console.log('Username already taken:', username);
        }
      } catch (err) {
        console.log('Username check failed:', err.message);
      }
      
      if (usernameTaken) {
        return Response.json({ 
          error: 'Username already taken. Please choose another.',
          needsRegistration: false
        }, { status: 409 });
      }
      
      try {
        console.log('Creating user with username:', username);
        // Create user with username, wallet address, and placeholder email (platform requires email)
        const newUser = await serviceRole.entities.User.create({
          email: `${walletAddress.slice(0, 8)}@elevenx.bet`,
          full_name: username,
          username: username,
          wallet_address: walletAddress,
          role: 'user',
        });
        
        console.log('✓ User created - id:', newUser.id, 'username:', newUser.full_name);
        
        return Response.json({
          success: true,
          needsRegistration: false,
          userId: newUser.id,
          full_name: newUser.full_name,
          username: newUser.username,
          walletAddress: newUser.wallet_address,
          role: newUser.role,
          email: newUser.email,
          isNewUser: true
        });
      } catch (createErr) {
        console.error('✗ User creation failed:', createErr);
        return Response.json({ error: 'Failed to create user: ' + createErr.message }, { status: 500 });
      }
    }

    // If not registering (just checking), return user info if exists
    if (!user) {
      console.log('No user found, needs registration');
      return Response.json({ 
        needsRegistration: true,
        walletAddress 
      }, { status: 404 });
    }

    // User exists - return user info (handle both root-level and data.* fields)
    console.log('✓ User authenticated - username:', user.full_name || user.username, 'id:', user.id);
    return Response.json({
      success: true,
      userId: user.id,
      walletAddress: user.wallet_address || user.data?.wallet_address,
      role: user.role || user.data?.role,
      full_name: user.full_name || user.data?.full_name,
      username: user.username || user.data?.username,
      email: user.email
    });

  } catch (error) {
    console.error('walletAuth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});