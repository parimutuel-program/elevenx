# Futures Bet Status Fix

## Problem
Futures bet cards showed "ACTIVE" status even after the market settled on-chain. The UI didn't reflect won/lost/claimable states because it relied on database status instead of on-chain truth.

## Solution

### 1. Updated `checkFuturesMarketStatus` Function
- Now reads `winning_outcome` from byte offset 155 (0=1st, 1=2nd, 2=3rd)
- Reads `settled` from byte offset 276
- Reads `voided` from byte offset 277
- Returns all three fields to the frontend

### 2. Enhanced BetCard Component
- Automatically detects futures markets vs match markets
- Calls `checkFuturesMarketStatus` for futures, `checkMarketStatus` for matches
- Overrides local status based on on-chain data:
  - `voided=true` → "Refundable" status
  - `settled=true` + bet outcome matches winning_outcome → "Won 🎉" status
  - `settled=true` + bet outcome doesn't match → "Lost" status
  - Not settled → "Awaiting Result" status

### 3. Improved UX for Won Bets
- **Won status badge**: Gradient green/gold with "Won 🎉" label
- **Claimed status badge**: Gradient with "Claimed ✓" label
- **Prominent claim button**: Large gradient button showing claimable amount
- **Win explanation**: Shows which team/position won and why the bet won
- **Better messaging**: "Team Alpha won 1st place" instead of just "Won"

### 4. Status Mapping
- `active` → "Active" (betting still open)
- `pending` → "Awaiting Result" (betting closed, not yet settled)
- `won` → "Won 🎉" (market settled, bet backed the winner)
- `lost` → "Lost" (market settled, bet backed the loser)
- `claimed` → "Claimed ✓" (winnings already claimed)
- `refunded` → "Refundable" (market voided, can claim refund)

### 5. On-Chain Verification Flow
1. User places bet on Team Alpha (1st place)
2. Market settles on-chain with winning_outcome=0 (1st place)
3. BetCard queries `checkFuturesMarketStatus` every 30 seconds
4. On-chain data shows: `settled=true`, `winning_outcome=0`
5. Bet outcome `a` maps to index 0
6. Status automatically updates to "Won 🎉"
7. Claim button appears with gradient styling
8. User claims → status changes to "Claimed ✓"

## Testing
To test:
1. Place a futures bet on any outcome
2. Settle the market on-chain with that outcome as winner
3. Wait ~30 seconds for BetCard to refetch on-chain state
4. Card should show "Won 🎉" with claim button
5. After claiming, card shows "Claimed ✓" with amount received

## Files Modified
- `functions/checkFuturesMarketStatus` - Added winning_outcome parsing
- `components/dashboard/BetCard` - Enhanced status logic and UX
- `pages/MyBets` - Uses BetCard component (no changes needed)