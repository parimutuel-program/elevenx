# ElevenX Smart Contract Deployment Guide

## 🚀 Step-by-Step Deployment Process

### Prerequisites Checklist
- [ ] Rust installed (latest stable version)
- [ ] Node.js installed (v18+)
- [ ] Solana CLI installed (v1.17+)
- [ ] Anchor CLI installed (v0.30.1)
- [ ] Phantom wallet installed
- [ ] SOL for deployment fees (~0.5 SOL for devnet testing)

---

## Phase 1: Local Development & Testing

### 1.1 Setup Environment
```bash
# Navigate to smart contract directory
cd solana-programs/elevenx-betting

# Install dependencies
npm install

# Verify Anchor version
anchor --version
# Should output: anchor-cli 0.30.1
```

### 1.2 Build the Program
```bash
# Build for local testing
anchor build

# This generates:
# - target/deploy/elevenx_betting.so (program binary)
# - target/idl/elevenx_betting.json (interface definition)
# - target/types/elevenx_betting.ts (TypeScript types)
```

### 1.3 Run Local Tests
```bash
# Start local validator and run tests
anchor test

# Tests should cover:
# ✅ Initialize bet pool
# ✅ Create bet offer (LP deposits SOL)
# ✅ Match bet (matcher deposits SOL)
# ✅ Settle bet (admin sets winner)
# ✅ Claim winnings (user claims payout)
```

### 1.4 Expected Test Output
```
✓ Initialize bet pool (50ms)
✓ Create bet offer - LP deposits 1 SOL (120ms)
✓ Match bet - Matcher backs opposite outcome (150ms)
✓ Settle bet - Admin declares winner (80ms)
✓ Claim winnings - User receives payout (100ms)

5 passing (500ms)
```

---

## Phase 2: Devnet Deployment

### 2.1 Configure for Devnet
```bash
# Update Anchor.toml
[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

# Create devnet wallet if needed
solana-keygen new --outfile ~/.config/solana/id.json

# Fund wallet with devnet SOL
solana airdrop 2 <YOUR_WALLET_ADDRESS> --url devnet
```

### 2.2 Generate New Program ID
```bash
# Generate new keypair for program
solana-keygen new --outfile keypair.json

# Copy the generated public key
solana pubkey keypair.json

# Update lib.rs with new program ID
# declare_id!("YourGeneratedProgramIDHere111111111111111");

# Update Anchor.toml
[programs.devnet]
elevenx_betting = "YourGeneratedProgramIDHere111111111111111"
```

### 2.3 Deploy to Devnet
```bash
# Deploy program
anchor deploy

# Expected output:
# Deploying program "elevenx_betting"...
# Program Id: YourGeneratedProgramIDHere111111111111111
# Deployment slot: 123456789
```

### 2.4 Verify Deployment
```bash
# Check program account
solana program show YourGeneratedProgramIDHere111111111111111 --url devnet

# Should show:
# Program Type: BPF
# Program Authority: <your wallet>
# Last deployed slot: 123456789
```

### 2.5 Test on Devnet
```bash
# Run tests against devnet
anchor test --provider.cluster devnet

# Or use custom test script
npm run test:devnet
```

---

## Phase 3: Frontend Integration

### 3.1 Update Backend Constants
Update these files with your deployed program ID:

**functions/createBetOffer.js:**
```javascript
const SOLANA_PROGRAM_ID = 'YourDeployedProgramID111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com'; // Change to mainnet for production
```

**functions/matchBet.js:**
```javascript
const SOLANA_PROGRAM_ID = 'YourDeployedProgramID111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
```

**functions/claimWinnings.js:**
```javascript
const SOLANA_PROGRAM_ID = 'YourDeployedProgramID111111111111111';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
```

### 3.2 Update Smart Contract Fee
The contract currently has 2% fee. Update to 0%:

**lib.rs line 20:**
```rust
bet_pool.fee_percent = 0; // 0% fee - fully decentralized
```

### 3.3 Test Complete Flow
1. Connect Phantom wallet to app
2. Create a bet offer (LP)
3. Match the bet (different user)
4. Settle the bet (admin)
5. Claim winnings (winner)

---

## Phase 4: Mainnet Deployment

### 4.1 Pre-Mainnet Checklist
- [ ] All tests passing on devnet
- [ ] Security audit completed
- [ ] Emergency pause mechanism tested
- [ ] Multi-sig wallet configured for admin functions
- [ ] Oracle integration tested
- [ ] At least 5 SOL in deployment wallet

### 4.2 Configure for Mainnet
```bash
# Update Anchor.toml
[provider]
cluster = "mainnet"
wallet = "~/.config/solana/mainnet-wallet.json"

# Use secure wallet (hardware wallet recommended)
```

### 4.3 Deploy to Mainnet
```bash
# Deploy
anchor deploy --provider.cluster mainnet

# Verify
solana program show YourMainnetProgramID --url mainnet
```

### 4.4 Update Production Constants
**functions/createBetOffer.js:**
```javascript
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
```

**functions/matchBet.js:**
```javascript
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
```

---

## 🔧 Troubleshooting

### Common Issues

**1. "Program deployment failed"**
```bash
# Increase buffer size
solana program deploy --buffer-keypair keypair.json elevenx_betting.so
```

**2. "Transaction simulation failed"**
- Check program ID matches in all files
- Verify wallet has sufficient SOL
- Check cluster configuration (devnet vs mainnet)

**3. "Account not initialized"**
- Run initialization instruction first
- Check PDA derivation matches frontend

**4. "Insufficient funds"**
```bash
# Check balance
solana balance --url devnet

# Airdrop more (devnet only)
solana airdrop 2 --url devnet
```

---

## 📊 Post-Deployment Verification

### Monitor Program Activity
```bash
# View program logs
solana logs YourProgramID --url devnet

# Check program accounts
solana accounts --program-id YourProgramID --url devnet
```

### Test Critical Functions
1. ✅ Initialize new bet pool
2. ✅ LP can create offer
3. ✅ Matcher can match bet
4. ✅ Admin can settle
5. ✅ Winner can claim
6. ✅ Loser cannot claim
7. ✅ Unmatched offers can be refunded

---

## 🎯 Next Steps After Deployment

1. **Oracle Integration** - Connect Pyth/Switchboard for automated settlement
2. **Admin Dashboard** - Build UI for match management
3. **Monitoring** - Set up alerts for failed transactions
4. **Analytics** - Track betting volume, user activity
5. **Security** - Implement rate limiting, input validation

---

## 📞 Support

- Anchor Documentation: https://www.anchor-lang.com/docs
- Solana Documentation: https://docs.solana.com
- ElevenX Team: [Add contact info]

**Last Updated:** 2026-05-31