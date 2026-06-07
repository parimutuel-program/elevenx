# Deploy Solana Program - Quick Guide

## Prerequisites
1. Install Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools
2. Install Anchor CLI: https://www.anchor-lang.com/docs/installation

## Deployment Steps

### 1. Navigate to program directory
```bash
cd solana-programs/elevenx-betting
```

### 2. Run deployment script
```bash
bash deploy.sh
```

The script will:
- Configure Solana devnet
- Generate a keypair (if needed)
- Request airdrop (if balance < 1 SOL)
- Build the program
- Deploy to devnet

### 3. Copy the Program ID
After deployment completes, you'll see output like:
```
Deploying program 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin...
```
Copy the program ID (the long base58 string).

### 4. Update Base44 Secret
Go to Base44 Dashboard → Settings → Secrets and update:
- **SOLANA_PROGRAM_ID**: `[paste your new program ID here]`

### 5. Test Platform Initialization
After updating the secret, go back to the Admin page and click "Init Platform" again.

## Manual Deployment (if script fails)

```bash
# Set to devnet
solana config set --url devnet

# Build
anchor build

# Deploy
anchor deploy

# Copy the program ID from output
```

## Troubleshooting

**"Program already deployed"**: The program ID in secrets is correct, but platform config already exists. Use the "Reinit Platform" button instead.

**"Insufficient funds"**: Request more SOL:
```bash
solana airdrop 2
```

**"Anchor build failed"**: Make sure you're in the program directory and have Rust installed:
```bash
rustup update
``