import { Buffer } from 'node:buffer';

// Helper function to compute SHA256 hash (returns hex string)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    // Compute discriminator for claim_winnings
    const discriminatorHex = await sha256('global:claim_winnings');
    const discriminatorBytes = Buffer.from(discriminatorHex, 'hex').slice(0, 8);
    
    console.log('=== CLAIM_WINNINGS DISCRIMINATOR ===');
    console.log('Input: "global:claim_winnings"');
    console.log('SHA256 full hash:', discriminatorHex);
    console.log('First 8 bytes (hex):', discriminatorBytes.toString('hex'));
    console.log('Discriminator (base64):', discriminatorBytes.toString('base64'));
    console.log('Discriminator bytes:', Array.from(discriminatorBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', '));
    console.log('=====================================');
    
    return Response.json({
      instruction: 'claim_winnings',
      discriminator_hex: discriminatorBytes.toString('hex'),
      discriminator_base64: discriminatorBytes.toString('base64'),
      discriminator_bytes: Array.from(discriminatorBytes),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});