# claimWinnings Function Implementation

## Problem
The Claim button was calling a backend function `claimWinnings` that returned 404 - the function didn't exist or wasn't properly deployed.

## Solution
Created the `claimWinnings` backend function that builds and returns the `claim_winnings` instruction for the Solana program.

## Function Details

### Endpoint
`POST /functions/claimWinnings`

### Input Parameters
- `userBetId` (string): The UserBet entity ID to claim
- `walletAddress` (string): The bettor's Solana wallet address (base58)

### Output
Returns a Solana instruction object ready for signing:
```json
{
  "success": true,
  "message": "Ready to claim ◎X.XXXX SOL",
  "userBetId": "...",
  "payout": 123.456,
  "solana_instruction": {
    "instruction_type": "claim_winnings",
    "programId": "EQiqoL7VX5n4BTxuHwyWBa1bmYvTSeWRWBdSCyyFxHvN",
    "keys": [...],
    "instruction_data": "base64...",
    "amountLamports": 123456000000
  }
}
```

### Implementation Details

1. **Authentication**: Uses `createClientFromRequest(req)` to authenticate the user
2. **Service Role**: Uses `base44.asServiceRole` to bypass RLS and fetch UserBet/Bet entities
3. **Solana Config**: Reads `SOLANA_RPC_URL` and `ELEVENX_PROGRAM_ID` from environment secrets

### Validation
- Checks wallet address is provided
- Verifies UserBet exists
- Fetches associated Bet or FuturesMarket entity
- Confirms market status is 'settled'
- Verifies the bet actually won (outcome matches winning_outcome)
- Checks market exists on-chain

### PDA Derivation
- **Market PDA**: `["market", marketId (32 bytes)]`
- **Bet Position PDA**: `["position", marketPda, bettorWallet, [outcome]]`
- **Fee Vault PDA**: `["fee_vault"]`

### Instruction Building
- **Discriminator**: `[161, 215, 24, 59, 14, 236, 242, 221]` (SHA256 of "global:claim_winnings" first 8 bytes)
- **Data Layout**: 8-byte discriminator + 1-byte outcome (u8) = 9 bytes total
- **Accounts** (in order):
  1. `market` (writable)
  2. `bet_position` (writable)
  3. `fee_vault` (writable)
  4. `bettor` (signer, writable)
  5. `system_program` (readonly)

### Error Handling
Returns appropriate error responses:
- 400: Missing wallet, market not settled, bet didn't win, market not on-chain
- 404: UserBet not found, Bet/FuturesMarket not found
- 500: Internal server error

## Frontend Integration
The BetCard component (line 161) calls this function:
```javascript
const res = await base44.functions.invoke('claimWinnings', {
  userBetId: bet.id,
  walletAddress: walletAddress
});
```

The returned `solana_instruction` is passed to `SolanaTransactionSigner` for wallet signing.

## Testing
Test with a real settled bet:
```bash
curl -X POST https://your-app.base44.app/functions/claimWinnings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"userBetId": "REAL_BET_ID", "walletAddress": "YOUR_WALLET"}'
```

Expected response for a winning bet:
- Status 200
- `solana_instruction` object with correct discriminator and accounts
- `payout` amount in SOL

Expected errors:
- "Market not settled yet" - market still active
- "This bet did not win" - backed losing outcome
- "Market not found on-chain" - market PDA doesn't exist

## Files Modified
- `functions/claimWinnings` - Complete rewrite with proper instruction building

## Related Functions
- `claimRefund` - For voided markets
- `finalizeClaim` - Updates DB after successful claim
- `checkMarketStatus` / `checkFuturesMarketStatus` - Verify on-chain settlement state