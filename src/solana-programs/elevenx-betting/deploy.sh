#!/bin/bash

# ElevenX Betting Program Deployment Script
# This script deploys the Solana program to devnet

set -e

echo "🎲 ElevenX Betting Program Deployment"
echo "======================================"

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI not found. Install from https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
fi

# Check if Anchor CLI is installed
if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor CLI not found. Install from https://www.anchor-lang.com/docs/installation"
    exit 1
fi

echo "✅ Solana and Anchor CLI found"

# Set cluster to devnet
echo ""
echo "📡 Configuring Solana cluster to devnet..."
solana config set --url devnet

# Generate keypair if it doesn't exist
KEYPAIR_PATH=~/.config/solana/id.json
if [ ! -f "$KEYPAIR_PATH" ]; then
    echo ""
    echo "🔑 Generating new keypair..."
    solana-keygen new --outfile $KEYPAIR_PATH
fi

# Check SOL balance
BALANCE=$(solana balance --json | grep '"sol":' | sed 's/.*"sol":\([0-9.]*\).*/\1/')
echo ""
echo "💰 Current SOL balance: $BALANCE"

if (( $(echo "$BALANCE < 1" | bc -l) )); then
    echo "⚠️  Balance too low. Requesting airdrop..."
    solana airdrop 2
fi

# Build the program
echo ""
echo "🔨 Building program..."
anchor build

# Deploy the program
echo ""
echo "🚀 Deploying program to devnet..."
anchor deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Copy the Program ID from the output above"
echo "2. Update SOLANA__PROGRAM_ID in Base44 Dashboard → Settings → Secrets"
echo "3. Update your backend functions to use the new program ID"
echo ""
echo "🎉 Done!"