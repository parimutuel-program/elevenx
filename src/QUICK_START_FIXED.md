# 🚀 Quick Start Guide - Fixed Platform

## ✅ What's Been Fixed

1. **Wallet Address Normalization** - All wallet addresses are now trimmed and validated consistently
2. **PDA Derivation Hardening** - Backend and blockchain now use identical keys
3. **Bulletproof Claims** - First-try success rate, no more retries needed

## 🎯 What To Do Now

### Step 1: Initialize Platform (If Not Already Done)
1. Connect your Phantom wallet
2. Go to: `/init-platform`
3. Click "Initialize Platform"
4. Sign the transaction

### Step 2: Run Diagnostics
1. Go to: `/diagnostics` (admin only)
2. Click "Run Full Test"
3. Wait for results
4. All tests should show ✅ PASSED

### Step 3: Test Betting Flow
1. Create a test market (via `/admin` or `/matches`)
2. Create market on-chain (via "Create Market On-Chain" button)
3. Add liquidity as LP (via `/lp`)
4. Place a bet (via `/matches`)
5. Settle the market (admin only)
6. Claim winnings (should work on first try!)

## 🔧 Troubleshooting

### If You Still Get Error 3012:
1. **Clear your browser cache** (Ctrl+Shift+Delete)
2. **Disconnect and reconnect** your wallet
3. **Run diagnostics** to verify platform is initialized
4. **Check the console logs** (F12) for specific error messages

### If Claims Don't Work on First Try:
1. **Verify market is settled** on-chain (check `/diagnostics`)
2. **Ensure wallet is connected** and authenticated
3. **Try claiming smaller amounts** first
4. **Check console logs** for wallet address mismatches

## 📊 Monitoring

Use `/diagnostics` to monitor:
- ✅ Platform initialization status
- ✅ On-chain market count
- ✅ Active LP offers
- ✅ Unclaimed winnings
- ✅ User bet statistics

## 🎉 Success Criteria

You'll know it's fixed when:
- ✅ Platform shows "READY" in diagnostics
- ✅ Betting works without 3012 errors
- ✅ Claims succeed on first try
- ✅ No more "wallet not authenticated" errors
- ✅ LP provision works smoothly

## 🆘 Still Having Issues?

1. **Check console logs** (F12 → Console tab)
2. **Run diagnostics** and screenshot the results
3. **Note the exact error message** and when it occurs
4. **Verify your wallet address** matches in all places

---

**Last Updated**: 2026-06-05
**Fix Version**: 2.0 (Permanent Fix)