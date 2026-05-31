#!/bin/bash

# ElevenX Smart Contract Deployment Script
# Automates the deployment process for ElevenX betting contracts

set -e

echo "🚀 ElevenX Smart Contract Deployment"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Solana CLI
if ! command -v solana &> /dev/null; then
    echo -e "${RED}❌ Solana CLI not found. Install from: https://docs.solana.com/cli/install-solana-cli-tools${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Solana CLI installed${NC}"

# Check Anchor CLI
if ! command -v anchor &> /dev/null; then
    echo -e "${RED}❌ Anchor CLI not found. Install with: cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Anchor CLI installed${NC}"

# Check Rust
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}❌ Rust not found. Install from: https://rustup.rs/${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Rust installed${NC}"

echo ""
echo "🔧 Building smart contract..."
anchor build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo ""
echo "🧪 Running tests..."
anchor test

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi

echo ""
echo "📝 Deployment Summary"
echo "===================="
echo "✅ Smart contract built successfully"
echo "✅ All tests passing"
echo ""
echo "Next steps:"
echo "1. Update Anchor.toml with target cluster (devnet/mainnet)"
echo "2. Generate new program ID if deploying for first time"
echo "3. Fund deployment wallet with SOL"
echo "4. Run: anchor deploy"
echo ""
echo -e "${YELLOW}📖 See DEPLOYMENT_GUIDE.md for detailed instructions${NC}"