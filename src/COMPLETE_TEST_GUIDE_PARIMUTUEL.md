# Complete Parimutuel Betting Flow Test Guide (A-Z)

## Overview
This guide tests the **complete parimutuel betting flow** where bettors bet directly into the pool without needing explicit LPs. All bettors are "under-the-hood" LPs.

---

## Quick Start: Run Automated Test

### Step 1: Execute Test Function
1. Go to **Dashboard → Code → Functions**
2. Find **`testParimutuelFlow`**
3. Click **"Test"** button
4. Wait for success response

**Expected Output:**
```json
{
  "success": true,
  "testData": {
    "pools": { "argentina": 8, "france": 7, "draw": 5, "total": 20 },
    "parimutuelOdds": { "argentina": "2.3750", "france": "2.7143", "draw": "3.8000" },
    "platformFee": 1,
    "winningBets": [
      { "wallet": "Bettor1...", "stake": 3, "payout": 7.125, "profit": "137.5%" }
    ]
  }
}
```

---

## Manual End-to-End Testing

### Phase 1: Setup Market

#### 1.1 Create Match
- **Admin Dashboard** → Create Match
- Teams: Argentina 🇦🇷 vs France 🇫🇷
- Stage: Final
- Venue: Lusail Stadium

#### 1.2 Create Bet Market
- **Function:** `createMarketOnChain`
- **Payload:**
```json
{
  "betId": "<bet_id_from_test>"
}
```
- **Result:** Market deployed on Solana devnet

---

### Phase 2: Bettors Place Bets (Parimutuel Mode)

#### 2.1 Bettor 1 - Argentina Fan
- **Function:** `placeBet`
- **Payload:**
```json
{
  "walletAddress": "Bettor1Wallet...",
  "bet_id": "<bet_id>",
  "match_id": "<match_id>",
  "outcome": "a",
  "amount": 3
}
```
- **Mode:** Parimutuel (no `offer_id` = direct to pool)
- **Result:** 3 SOL → Argentina pool

#### 2.2 Bettor 2 - Messi GOAT
- Same as above, amount: **5 SOL**

#### 2.3 Bettor 3 - France Supporter
- Outcome: **b**, amount: **4 SOL**

#### 2.4 Bettor 4 - Mbappe Fan
- Outcome: **b**, amount: **3 SOL**

#### 2.5 Bettor 5 - Cautious Better
- Outcome: **draw**, amount: **2 SOL**

#### 2.6 Bettor 6 - Draw Hunter
- Outcome: **draw**, amount: **3 SOL**

**Total Pool:** 20 SOL (Argentina: 8, France: 7, Draw: 5)

---

### Phase 3: Commit Bets to Database

#### 3.1 After Each Transaction
- **Function:** `commitMatchBet`
- **Payload:**
```json
{
  "signature": "<solana_tx_signature>",
  "commit_data": {
    "bet_id": "...",
    "match_id": "...",
    "outcome": "a",
    "amount": 3,
    "wallet_address": "..."
  }
}
```

#### 3.2 Verify Pools Updated
- Check `Bet` entity:
  - `pool_a`: 8 SOL
  - `pool_b`: 7 SOL
  - `pool_draw`: 5 SOL
  - `total_pool`: 20 SOL
  - `total_bettors`: 6

---

### Phase 4: Settle Market

#### 4.1 Update Match Result
- **Admin:** Update match
- Score: Argentina 3 - 2 France
- Winner: `team_a`

#### 4.2 Settle Bet Market
- **Function:** `settleBetWithOracle`
- **Payload:**
```json
{
  "matchId": "<match_id>",
  "result": "team_a"
}
```

#### 4.3 Calculate Parimutuel Odds
```
Total Pool:        20 SOL
Platform Fee (5%):  1 SOL
────────────────────────
Distribution Pool: 19 SOL

Parimutuel Odds:
  Argentina: 19 / 8 = 2.375
  France:    19 / 7 = 2.714
  Draw:      19 / 5 = 3.800
```

#### 4.4 Update UserBet Statuses
- **Winning bets** (Argentina): `status: "won"`
- **Losing bets** (France, Draw): `status: "lost"`

---

### Phase 5: Withdrawals

#### 5.1 Winners Claim Winnings
- **Function:** `claimWinnings`
- **Payload:**
```json
{
  "userBetId": "<winning_bet_id>",
  "walletAddress": "Bettor1Wallet..."
}
```

**Expected Payouts:**
```
Bettor 1 (3 SOL): 3 × 2.375 = 7.125 SOL (+137.5% profit)
Bettor 2 (5 SOL): 5 × 2.375 = 11.875 SOL (+137.5% profit)
```

#### 5.2 Losers Claim Refunds
- **Function:** `claimRefund`
- **Payload:**
```json
{
  "userBetId": "<losing_bet_id>",
  "walletAddress": "Bettor3Wallet..."
}
```

**Expected Refunds:**
```
Bettor 3 (4 SOL): 4 SOL (full refund)
Bettor 4 (3 SOL): 3 SOL (full refund)
Bettor 5 (2 SOL): 2 SOL (full refund)
Bettor 6 (3 SOL): 3 SOL (full refund)
```

---

## Verification Checklist

### ✅ Market Creation
- [ ] Match entity created
- [ ] Bet entity created
- [ ] Market deployed on-chain (Solana PDA exists)
- [ ] `solana_market_created: true`

### ✅ Bet Placement (Parimutuel)
- [ ] UserBets created with `offer_id: null`
- [ ] UserBets have `role: "matcher"`
- [ ] Pools updated correctly
- [ ] Total pool = sum of all bets

### ✅ Settlement
- [ ] Match result updated
- [ ] Bet status = "settled"
- [ ] Winning outcome set
- [ ] Parimutuel odds calculated correctly

### ✅ Payouts
- [ ] Winners receive: stake × parimutuel odds
- [ ] Losers receive: full stake (refund)
- [ ] Platform fee = 5% of total pool
- [ ] All withdrawals confirmed on Solana

---

## Expected Math

```
Initial Pools:
  Argentina:  8 SOL
  France:     7 SOL
  Draw:       5 SOL
  ─────────────────
  Total:     20 SOL

After 5% Fee:
  Platform Fee:     1 SOL (5% of 20)
  Distribution:    19 SOL

Parimutuel Odds:
  Argentina: 19 / 8 = 2.375×
  France:    19 / 7 = 2.714×
  Draw:      19 / 5 = 3.800×

Final Payouts (Argentina wins):
  Bettor 1: 3 SOL × 2.375 = 7.125 SOL (+137.5%)
  Bettor 2: 5 SOL × 2.375 = 11.875 SOL (+137.5%)
  
  Bettor 3: 4 SOL refund
  Bettor 4: 3 SOL refund
  Bettor 5: 2 SOL refund
  Bettor 6: 3 SOL refund

Total Distributed:
  Winners: 19 SOL (7.125 + 11.875)
  Refunds: 12 SOL (4 + 3 + 2 + 3)
  Platform: 1 SOL fee
  ───────────────────────────────
  Total:   32 SOL (20 stake + 12 refund)
  
  Note: Refunds come from losing pool (12 SOL), 
  winners get remaining pool after fee (19 SOL)
```

---

## Troubleshooting

### "Market not initialized on-chain"
→ Call `createMarketOnChain` first before placing bets

### "Betting window closed"
→ Check `open_until` timestamp is in the future
→ Use `bulkUpdateBettingWindows` to extend

### "Nothing to claim"
→ Verify UserBet status = "won" (for winnings) or "lost" (for refunds)
→ Check market status = "settled"

### "Invalid market PDA"
→ Ensure `solana_market_created: true`
→ Verify PDA derivation matches on-chain program

---

## Test Functions Available

1. **`testParimutuelFlow`** - Complete parimutuel scenario (recommended)
   - Creates match, bet, 6 bettors, settles, calculates payouts
   
2. **`testLpFeeSharing`** - LP fee bonus scenario
   - Tests explicit LP model with fee sharing

---

## Next Steps After Testing

1. **Deploy to Production**
   - Update SOLANA_PROGRAM_ID to production
   - Use mainnet-beta instead of devnet

2. **Monitor Real Bets**
   - Track pool distributions
   - Verify parimutuel odds calculation
   - Monitor withdrawal success rate

3. **Optimize Fee Structure**
   - Adjust `fee_percent` if needed
   - Test different fee percentages

---

**Status:** ✅ Ready for testing
**Test Function:** `testParimutuelFlow`
**Betting Mode:** Parimutuel (no LP offers needed)