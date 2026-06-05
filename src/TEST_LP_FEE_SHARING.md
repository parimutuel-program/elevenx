# LP Fee Sharing - Quick Test Guide

## Prerequisites
- Admin access to the app
- Phantom wallet connected (for manual testing)

## Option 1: Automated Test (Recommended)

### Step 1: Run Test Function
1. Go to **Dashboard → Code → Functions**
2. Find **`testLpFeeSharing`**
3. Click **"Test"** button
4. Wait for success response

**Expected Output:**
```json
{
  "success": true,
  "testData": {
    "lpStake": 10,
    "totalLosingPool": 15,
    "platformFee": 0.75,
    "lpIncentivePool": 0.375,
    "lpBonus": 0.375,
    "expectedTotalWithdraw": 15.375
  }
}
```

### Step 2: Withdraw LP Position
1. Navigate to **`/lp`** (LP Dashboard)
2. Find **"Test Team A vs Test Team B"** position
3. Click **"Withdraw"** button
4. Sign the Solana transaction in Phantom
5. View success dialog

**Expected Result:**
- Base winnings: **◎15.0000 SOL**
- LP fee bonus: **◎0.3750 SOL** (50% of 5% platform fee)
- **Total: ◎15.3750 SOL** ✨

### Step 3: Verify on Solscan
1. Click **"View on Solscan"** in success dialog
2. Verify transaction amount matches expected withdraw
3. Check transaction status: **Success**

---

## Option 2: Manual End-to-End Test

### Setup Phase
1. **Create a match** (Admin Dashboard)
2. **Create a bet market** on the match
3. **Deploy market on-chain** (createMarketOnChain)

### LP Provides Liquidity
4. Go to `/lp`
5. Click on a match
6. Provide **10 SOL** liquidity on **Team A**
7. Sign transaction
8. Note the LP position ID

### Bettors Match the Liquidity
9. Go to `/matches`
10. Open the same match
11. Have 3 different users bet on **Team B**:
    - User 1: **5 SOL**
    - User 2: **7 SOL**
    - User 3: **3 SOL**
    - **Total: 15 SOL** (fully matches LP's 10 SOL)

### Settle the Market
12. Admin: Update match result (Team A wins 3-1)
13. Admin: Settle the bet market
14. Verify LP position status = "won"

### LP Withdraws with Fee Bonus
15. LP goes to `/lp` → "My LP" tab
16. Click **"Withdraw"** on the position
17. Sign withdrawal transaction
18. **Verify LP receives:**
    - Base: ◎15.0 SOL (losing pool)
    - Bonus: ◎0.375 SOL (fee share)
    - **Total: ◎15.375 SOL**

---

## Verification Checklist

### Backend Calculation ✅
- [ ] Losing pool = 15 SOL
- [ ] Platform fee (5%) = 0.75 SOL
- [ ] LP incentive pool (50%) = 0.375 SOL
- [ ] LP share = 100% (only LP on winning side)
- [ ] LP bonus = 0.375 SOL

### Frontend Display ✅
- [ ] Withdraw button shows available amount
- [ ] Success dialog displays LP fee bonus breakdown
- [ ] Total withdrawal = base + bonus

### On-Chain Transaction ✅
- [ ] Transaction includes correct lamports
- [ ] Transaction confirms successfully
- [ ] Solscan shows correct amount transferred

### Database Updates ✅
- [ ] UserBet status = "claimed" after withdrawal
- [ ] BetOffer status updated
- [ ] LP position removed from dashboard

---

## Expected Math

```
Losing Pool (Team B bettors):     15.000 SOL
Platform Fee (5%):                 0.750 SOL
LP Incentive (50% of fee):         0.375 SOL

LP Withdrawal:
  Base winnings (losing pool):    15.000 SOL
  LP fee bonus:                    0.375 SOL
  ─────────────────────────────────────────
  Total:                          15.375 SOL
```

---

## Troubleshooting

### "Market not settled" error
→ Admin must settle the market first (update match result, then settle bet)

### "No LP fee bonus shown"
→ Check UserBet role = 'lp' (not 'matcher')
→ Verify market status = 'settled'
→ Confirm LP's outcome = winning outcome

### "Withdrawal amount incorrect"
→ Check withdrawLpWinnings function logs
→ Verify losing bets have status = 'lost'
→ Confirm fee_percent = 500 (5% in basis points)

---

## Cleanup (After Testing)
1. Delete test match and bet entities
2. Remove test UserBet records
3. Reset test wallets if needed

---

**Status:** ✅ Ready for testing
**Test Function:** `testLpFeeSharing`
**Dashboard:** `/lp