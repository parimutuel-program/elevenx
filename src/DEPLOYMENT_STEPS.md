# ElevenX - Smart Contract Deployment Guide

## 🚀 Quick Start Deployment

### Prerequisites
- Node.js v18+
- Rust v1.70+
- Solana CLI v1.17+
- Anchor Framework v0.30.1

### Step 1: Install Dependencies

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Verify installation
solana --version

# Install Anchor CLI
npm install -g @coral-xyz/anchor-cli@0.30.1

# Verify Anchor
anchor --version
```

### Step 2: Build Smart Contract

```bash
cd solana-programs/elevenx-betting

# Install Rust dependencies
cargo build-bpf

# Build with Anchor
anchor build
```

### Step 3: Deploy to Devnet (Testing)

```bash
# Configure Solana CLI for devnet
solana config set --url devnet

# Generate keypair if needed
solana-keygen new -o ~/.config/solana/devnet-wallet.json

# Request devnet SOL
solana airdrop 2 --url devnet

# Deploy program
anchor deploy --provider.cluster devnet

# Copy the program ID from output
# Update declare_id!() in lib.rs with your program ID
```

### Step 4: Initialize Bet Pool on Devnet

```bash
# Run tests
anchor test --provider.cluster devnet

# Initialize a test bet pool
anchor run ts-node scripts/initialize-pool.ts <BET_ID> <MATCH_ID>
```

### Step 5: Deploy to Mainnet (Production)

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Deploy program (requires mainnet SOL)
anchor deploy --provider.cluster mainnet-beta

# Verify deployment
solana program show <YOUR_PROGRAM_ID>
```

### Step 6: Update Backend Functions

Update the `SOLANA_PROGRAM_ID` constant in:
- `functions/createBetOffer.js`
- `functions/matchBet.js`
- `functions/claimWinnings.js`

```javascript
const SOLANA_PROGRAM_ID = 'YourDeployedProgramId';
```

### Step 7: Test Integration

1. **Create Bet Offer**
   ```bash
   curl -X POST https://your-app.base44.app/functions/createBetOffer \
     -H "Content-Type: application/json" \
     -d '{"bet_id": "test123", "match_id": "match456", "outcome": "a", "amount": 1}'
   ```

2. **Match Bet**
   ```bash
   curl -X POST https://your-app.base44.app/functions/matchBet \
     -H "Content-Type: application/json" \
     -d '{"offer_id": "offer789", "bet_id": "test123", "match_id": "match456", "amount": 0.5}'
   ```

3. **Verify On-Chain**
   - Check Solana Explorer: https://solscan.io/account/<BET_POOL_PDA>
   - Verify PDAs match expected values

## 📊 Monitoring & Maintenance

### Check Program Logs

```bash
solana logs <YOUR_PROGRAM_ID> --url mainnet-beta
```

### Verify PDAs

```bash
# Get bet pool PDA
solana address --keypair <PATH_TO_KEYPAIR>

# Check account data
solana account <BET_POOL_PDA> --url mainnet-beta
```

### Upgrade Program

```bash
# Build new version
anchor build

# Deploy upgrade
solana program deploy \
  --program-id <YOUR_PROGRAM_ID> \
  target/deploy/elevenx_betting.so \
  --url mainnet-beta
```

## 🔒 Security Checklist

- [ ] Audit smart contract code (OtterSec/Neodyme)
- [ ] Enable multi-sig for admin functions
- [ ] Set up monitoring alerts
- [ ] Test on devnet extensively
- [ ] Implement rate limiting
- [ ] Add emergency pause mechanism
- [ ] Document all admin keys securely

## 📱 Frontend Integration

### Install Solana Web3.js

```bash
npm install @solana/web3.js
```

### Sign Transaction Example

```javascript
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

async function signTransaction(instruction, amount) {
  const provider = window.solana;
  await provider.connect();
  
  const transaction = new Transaction();
  transaction.add(instruction);
  
  const { signature } = await provider.signAndSendTransaction(transaction);
  return signature;
}
```

## 🎯 Next Steps

1. **Oracle Integration**: Integrate Pyth Network for automatic settlements
2. **Analytics**: Set up Dune Analytics dashboard
3. **UI Updates**: Add transaction status indicators
4. **Testing**: Run comprehensive tests with real SOL

## 📞 Support

- Solana Docs: https://docs.solana.com/
- Anchor Docs: https://www.anchor-lang.com/
- Pyth Network: https://docs.pyth.network/

---

**Status**: Smart contracts ready for deployment. Backend functions configured for hybrid (database + on-chain) operation.