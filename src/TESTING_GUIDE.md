# Complete Testing Guide - LP Fee Sharing & Parimutuel Betting

## Overview
This guide covers testing for both the **LP Fee Sharing** system and **Parimutuel Betting** flow.

---

## Part 1: LP Fee Sharing Test ✅

### What It Tests
- LP provides liquidity on one outcome
- Regular bettors match against LP (creating losing pool)
- Market settles with LP's side winning
- LP withdraws and receives **50% of platform fees** as bonus

### How to Test

#### Step 1: Run Test Function
1. Go to **Dashboard → Code → Functions**
2. Find **`testLpFeeSharing`**
3. Click **"Test"**
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

#### Step 2: Withdraw LP Position
1. Navigate to **`/lp`** (LP Dashboard)
2. Find **"Test Team A vs Test Team B"** position
3. Click **"Withdraw"** button
4. Sign transaction in Phantom
5. View success dialog

**Expected Result:**
- Base winnings: **◎15.0000 SOL** (losing pool)
- LP fee bonus: **◎0.3750 SOL** (50% of 5% platform fee)
- **Total: ◎15.3750 SOL** ✨

#### Step 3: Verify on Solscan
1. Click **"View on Solscan"** in success dialog
2. Verify transaction amount
3. Check status: **Success**

---

## Part 2: Parimutuel Betting Test ✅

### What It Tests
- Complete parimutuel betting flow
- Multiple users bet on different outcomes
- Parimutuel odds calculated from pool distribution
- Market settlement and payout distribution
- Winners split pool, losers get refunds

### How to Test

#### Step 1: Run Test Function
1. Go to **Dashboard → Code → Functions**
2. Find **`testParimutuelFlow`**
3. Click **"Test"**
4. Wait for success response

**Expected Output:**
```json
{
  "success": true,
  "testData": {
    "match": "Argentina vs France (Final)",
    "result": "Argentina wins 3-2",
    "pools": {
      "argentina": 8,
      "france": 7,
      "draw": 5,
      "total": 20
    },
    "parimutuelOdds": {
      "argentina": "2.3750",
      "france": "2.7143",
      "draw": "3.8000"
    },
    "platformFee": 1
  }
}
```

#### Step 2: Verify Calculations

**Pool Distribution:**
- Argentina pool: 8 SOL (3 + 5 from 2 bettors)
- France pool: 7 SOL (4 + 3 from 2 bettors)
- Draw pool: 5 SOL (2 + 3 from 2 bettors)
- **Total pool: 20 SOL**

**Parimutuel Odds (after 5% fee):**
- Platform fee: 20 × 0.05 = **1 SOL**
- Distribution pool: 20 - 1 = **19 SOL**
- Argentina odds: 19 / 8 = **2.375x**
- France odds: 19 / 7 = **2.714x**
- Draw odds: 19 / 5 = **3.8x**

**Payouts (Argentina wins):**
- Bettor1 (3 SOL): 3 × 2.375 = **7.125 SOL**
- Bettor2 (5 SOL): 5 × 2.375 = **11.875 SOL**
- France/Draw bettors: Full refund of their stake

#### Step 3: Next Steps for Full Flow
To test the complete on-chain flow:

1. **Deploy market on-chain:**
   ```
   Call: createMarketOnChain
   Params: { betId: "6a2224ac5567798ea12c3016" }
   ```

2. **Bettors place bets (parimutuel mode):**
   ```
   Call: placeBet
   Params: { 
     betId: "...",
     outcome: "a",
     amount: 3,
     walletAddress: "..."
   }
   // No offer_id = parimutuel mode
   ```

3. **Commit bets to DB:**
   ```
   Call: commitMatchBet
   Params: { 
     signature: "...",
     commit_data: { ... }
   }
   ```

4. **Settle market:**
   ```
   Call: settleBetWithOracle
   Params: { 
     matchId: "...",
     result: "team_a"
   }
   ```

5. **Winners claim winnings:**
   ```
   Call: claimWinnings
   Params: { 
     userBetIds: ["...", "..."],
     walletAddress: "..."
   }
   ```

6. **Losers claim refunds:**
   ```
   Call: claimRefund
   Params: { 
     userBetIds: ["...", "..."],
     walletAddress: "..."
   }
   ```

---

## Verification Checklist

### LP Fee Sharing ✅
- [ ] LP position created with `role='lp'`
- [ ] Bettors match LP's liquidity
- [ ] Market settles with LP's outcome winning
- [ ] Backend calculates LP fee bonus correctly
- [ ] Withdraw transaction includes base + bonus
- [ ] Success dialog shows fee bonus breakdown
- [ ] On-chain transaction succeeds

### Parimutuel Betting ✅
- [ ] Multiple users bet on different outcomes
- [ ] Pools calculated correctly
- [ ] Platform fee (5%) deducted
- [ ] Parimutuel odds calculated from distribution pool
- [ ] Winning bets split pool proportionally
- [ ] Losing bets get full refund
- [ ] DB records updated correctly

---

## Test Functions Reference

### `testLpFeeSharing`
**Purpose:** Creates LP fee sharing test scenario
**Returns:**
- Match ID, Bet ID, LP Offer ID, LP UserBet ID
- Expected LP bonus calculation
- Step-by-step instructions

**Key Data:**
```json
{
  "lpStake": 10,
  "totalLosingPool": 15,
  "platformFee": 0.75,
  "lpIncentivePool": 0.375,
  "expectedTotalWithdraw": 15.375
}
```

### `testParimutuelFlow`
**Purpose:** Creates complete parimutuel betting scenario
**Returns:**
- Match ID, Bet ID, UserBets
- Pool distribution and parimutuel odds
- Calculated payouts and refunds
- Next steps for on-chain deployment

**Key Data:**
```json
{
  "pools": { "argentina": 8, "france": 7, "draw": 5 },
  "parimutuelOdds": { "argentina": "2.3750", "france": "2.7143" },
  "platformFee": 1,
  "withdrawals": [
    { "wallet": "...", "type": "winnings", "amount": 7.125 },
    { "wallet": "...", "type": "refund", "amount": 4 }
  ]
}
```

---

## Troubleshooting

### LP Fee Bonus Not Showing
**Issue:** Withdraw success dialog doesn't show LP fee bonus

**Check:**
1. LP position has `role='lp'` (not 'matcher')
2. Market status is 'settled'
3. LP's outcome matches `winning_outcome`
4. `withdrawLpWinnings` function returns `lpFeeBonus` field

### Parimutuel Odds Incorrect
**Issue:** Calculated odds don't match expected

**Check:**
1. All bets committed to DB
2. Pool totals updated in Bet entity
3. Platform fee (5%) deducted before odds calculation
4. Formula: `odds = (totalPool - fee) / poolForOutcome`

### Withdrawal Transaction Fails
**Issue:** On-chain transaction fails with error

**Common Errors:**
- **Error 0:** Betting window closed → Check match_end_time
- **Error 1:** Market already settled → Check bet.status
- **Error 9:** Nothing to claim → Check userBet.status
- **Error 6004:** Account not found → Deploy market on-chain first

---

## Success Criteria

### LP Fee Sharing ✅ PASS if:
- LP receives base winnings + fee bonus
- Bonus = 50% of (5% of losing pool)
- Success dialog displays breakdown
- Transaction confirmed on Solana

### Parimutuel Betting ✅ PASS if:
- Parimutuel odds calculated correctly
- Winners split pool proportionally
- Losers get full refund
- Platform fee deducted correctly
- All DB records updated

---

## Next Steps After Testing

1. **Production Deployment:**
   - Deploy markets on Solana devnet
   - Test with real SOL amounts
   - Verify on-chain transactions

2. **Monitoring:**
   - Track LP participation rates
   - Monitor fee distributions
   - Analyze parimutuel odds accuracy

3. **Optimization:**
   - Adjust fee percentages if needed
   - Fine-tune LP incentive share
   - Improve UI/UX based on user feedback

---

**Status:** ✅ Ready for testing
**Test Functions:** `testLpFeeSharing`, `testParimutuelFlow`
**Documentation:** LP_FEE_SHARING_COMPLETE.md, LP_FEE_SHARING_GUIDE.md