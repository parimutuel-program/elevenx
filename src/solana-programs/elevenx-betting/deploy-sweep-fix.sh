#!/bin/bash
set -e

echo "🔄 Deploying updated ElevenX betting program..."
echo ""

# Navigate to program directory
cd "$(dirname "$0")"

# Build the program
echo "🔨 Building program..."
anchor build

# Get program ID
PROGRAM_ID=$(grep '^declare_id!' programs/elevenx-betting/src/lib.rs | sed 's/declare_id!\("//' | sed 's/"\);//')
echo "📌 Program ID: $PROGRAM_ID"

# Deploy to devnet
echo "🚀 Deploying to devnet..."
anchor deploy --provider.cluster devnet

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Program deployed to: $PROGRAM_ID"
echo "Verify at: https://solscan.io/account/$PROGRAM_ID?cluster=devnet"
echo ""
echo "⚠️  IMPORTANT: Update SOLANA_PROGRAM_ID secret in Base44 dashboard if program ID changed!"