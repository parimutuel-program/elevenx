# ⚡ Quick Start - Deploy ElevenX to Devnet

## 5-Minute Setup (If you have prerequisites)

```bash
# 1. Navigate to smart contracts
cd solana-programs/elevenx-betting

# 2. Install dependencies
npm install

# 3. Build
anchor build

# 4. Test locally
anchor test

# 5. Setup devnet
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/devnet.json
solana airdrop 2 $(solana keygen pubkey ~/.config/solana/devnet.json)

# 6. Generate program ID
solana-keygen new --outfile keypair.json
echo "Program ID: $(solana pubkey keypair.json)"

# 7. Update lib.rs with your program ID (line 4)
# declare_id!("YOUR_GENERATED_ID_HERE");

# 8. Update Anchor.toml
# [programs.devnet]
# elevenx_betting = "YOUR_GENERATED_ID_HERE"

# 9. Deploy
anchor deploy --provider.cluster devnet

# 10. Verify
solana program show YOUR_PROGRAM_ID --url devnet
```

---

## Update Backend Functions

Create a config file for environment variables:

**functions/config.js:**
```javascript
export const CONFIG = {
  SOLANA_PROGRAM_ID: 'YOUR_DEPLOYED_PROGRAM_ID',
  SOLANA_RPC_URL: 'https://api.devnet.solana.com',
  ENV: 'devnet', // 'devnet' | 'mainnet'
};
```

Then update all backend functions to import this config.

---

## Test the Flow

1. **Connect Wallet** → `/register` with Phantom
2. **Create Match** → Admin creates match in `/admin`
3. **Open Market** → Admin opens betting market
4. **LP Creates Offer** → User offers liquidity
5. **Matcher Bets** → Another user matches the bet
6. **Settle** → Oracle or admin settles result
7. **Claim** → Winner claims winnings

---

## Common Issues

**❌ "Insufficient funds"**
```bash
solana airdrop 2 --url devnet
```

**❌ "Program not found"**
- Check program ID matches in lib.rs, Anchor.toml, and backend functions

**❌ "Transaction failed"**
- Check cluster: `solana config get`
- Should show: `RPC URL: https://api.devnet.solana.com`

---

## Next Steps

✅ Deployed to devnet? → Test complete flow
✅ Tests passing? → Move to Oracle Integration
✅ Oracle working? → Security audit
✅ Audit passed? → Deploy to mainnet

**Full guide:** See `DEPLOYMENT_GUIDE.md