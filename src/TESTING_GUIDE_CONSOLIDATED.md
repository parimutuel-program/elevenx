# Complete Testing Guide - LP Fee Sharing & Parimutuel Betting

## Quick Start

Two test functions are ready to validate both betting models:

1. **`testLpFeeSharing`** - Tests explicit LP model with fee bonuses
2. **`testParimutuelFlow`** - Tests parimutuel pool betting (no LP needed)

---

## Test 1: LP Fee Sharing ✅

### What It Tests
- LP provides liquidity on one outcome
- Regular bettors match against LP
- Market settles with LP's side winning
- **LP receives 50% of platform fees as bonus**

### Run Test
```
Dashboard → Code → Functions → testLpFeeSharing → Test
```

### Expected Results
```json
{
  "lpStake": 10,
  "totalLosingPool": 15,
  "platformFee": 0.75,
  "lpIncentivePool": 0.375,
  "expectedTotalWithdraw": 15.375
}
```

### Verify
1. Go to `/lp` (LP Dashboard)
2. Find test position
3. Click "Withdraw"
4. **Success dialog shows:**
   - Base winnings: ◎15.0000 SOL
   - LP fee bonus: ◎0.3750 SOL
   - **Total: ◎15.3750 SOL** ✨

---

## Test 2: Parimutuel Betting ✅

### What It Tests
- Complete parimutuel flow (no LP offers needed)
- Multiple bettors bet on different outcomes
- Parimutuel odds calculated from pool distribution
- Winners split pool, losers get refunds

### Run Test
```
Dashboard → Code → Functions → testParimutuelFlow → Test
```

### Expected Results
```json
{
  "pools": { "argentina": 8, "france": 7, "draw": 5, "total": 20 },
  "parimutuelOdds": { "argentina": "2.3750", "france": "2.7143" },
  "platformFee": 1,
  "winningBets": [
    { "stake": 3, "payout": 7.125, "profit": "137.5%" }
  ]
}
```

### Verify Math
```
Total Pool:     20 SOL
Platform Fee:    1 SOL (5%)
Distribution:   19 SOL

Argentina odds: 19 / 8 = 2.375×
Bettor1 (3 SOL): 3 × 2.375 = 7.125 SOL (+137.5%)
```

---

## Key Differences

| Feature | LP Fee Sharing | Parimutuel |
|---------|---------------|------------|
| **Liquidity Source** | Explicit LP provides liquidity | All bettors contribute to pool |
| **Odds Type** | Fixed odds (from The Odds API) | Dynamic (pool distribution) |
| **LP Bonus** | ✅ 50% of platform fees | ❌ No bonus (all bettors equal) |
| **Risk** | LP risks capital if outcome loses | No risk - losers get refund |
| **Payout** | Winner takes losing pool | Winners split distribution pool |

---

## Complete Flow Diagram

### LP Fee Sharing Flow
```
1. LP provides 10 SOL liquidity (fixed odds)
2. Bettors match 15 SOL against LP
3. Market settles (LP's side wins)
4. LP withdraws:
   - Base: 15 SOL (losing pool)
   - Bonus: 0.375 SOL (50% of 5% fee)
   - Total: 15.375 SOL
```

### Parimutuel Flow
```
1. Bettor1 bets 3 SOL on Argentina
2. Bettor2 bets 5 SOL on Argentina
3. Bettor3 bets 4 SOL on France
4. Bettor4 bets 3 SOL on France
5. Bettor5 bets 2 SOL on Draw
6. Bettor6 bets 3 SOL on Draw
7. Total pool: 20 SOL
8. Platform fee: 1 SOL (5%)
9. Distribution: 19 SOL
10. Argentina wins → odds = 19/8 = 2.375×
11. Winners split pool proportionally
12. Losers get full refund
```

---

## Files Reference

### Backend Functions
- `withdrawLpWinnings` - LP withdrawal with fee bonus
- `placeBet` - Place bet (parimutuel if no offer_id)
- `claimWinnings` - Winner claims parimutuel share
- `claimRefund` - Loser claims refund
- `testLpFeeSharing` - LP fee sharing test
- `testParimutuelFlow` - Parimutuel test

### Frontend Pages
- `/lp` - LP Dashboard (withdraw with fee bonus)
- `/matches` - Browse matches and place bets
- `/my-bets` - Claim winnings/refunds

### Documentation
- `LP_FEE_SHARING_GUIDE.md` - Detailed LP fee sharing guide
- `LP_FEE_SHARING_COMPLETE.md` - Implementation details
- `COMPLETE_TEST_GUIDE_PARIMUTUEL.md` - Parimutuel testing guide

---

## Troubleshooting

### LP Fee Bonus Not Showing
**Check:**
1. UserBet has `role: 'lp'` (not 'matcher')
2. Market status = 'settled'
3. LP's outcome = winning outcome
4. Call `withdrawLpWinnings` (not `withdrawLiquidity`)

### Parimutuel Odds Incorrect
**Check:**
1. All bets committed to DB
2. Pool totals updated in Bet entity
3. Platform fee (5%) deducted before odds calculation
4. Formula: `odds = (totalPool - fee) / poolForOutcome`

### Withdrawal Fails
**Common Issues:**
- Market not settled → Call `settleBetWithOracle`
- UserBet status wrong → Update to 'won' or 'lost'
- On-chain error → Check Solana transaction logs

---

## Success Criteria

### LP Fee Sharing ✅
- [ ] LP receives base + bonus
- [ ] Bonus = 50% of (5% of losing pool)
- [ ] Success dialog shows breakdown
- [ ] Transaction confirmed on Solana

### Parimutuel Betting ✅
- [ ] Pools calculated correctly
- [ ] Parimutuel odds accurate
- [ ] Winners split pool proportionally
- [ ] Losers get full refund
- [ ] Platform fee deducted correctly

---

## Next Steps

1. **Run both test functions** to verify calculations
2. **Test on devnet** with real SOL amounts
3. **Deploy to production** after successful testing
4. **Monitor** real betting activity

---

**Status:** ✅ Ready for testing
**Test Functions:** `testLpFeeSharing`, `testParimutuelFlow`
**Documentation:** Complete guides available