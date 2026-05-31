# ElevenX - Solana Smart Contract Integration Guide

## Overview

ElevenX is now a fully decentralized P2P betting platform on Solana. Users authenticate with their Solana wallet (Phantom), place bets through smart contracts, and receive automatic payouts via oracle-verified results.

## Current Implementation Status

### ✅ Completed (Backend & Frontend)

1. **Wallet-Based Authentication**
   - Login/Register pages updated to use Phantom wallet
   - Signature verification in `functions/walletAuth.js`
   - User entity extended with `wallet_address` field

2. **Betting Logic Backend Functions**
   - `createBetOffer.js` - Create liquidity offers (LP role)
   - `matchBet.js` - Match against existing offers (matcher role)
   - `claimWinnings.js` - Claim won bets
   - `settleBetWithOracle.js` - Admin settlement with oracle integration

3. **Frontend Updates**
   - Profile page shows wallet address and SOL-based stats
   - My Bets page displays wallet-specific bets
   - All currency symbols changed from $ to ◎ (Solana)

### 🚧 Next Steps - Smart Contract Deployment

## Smart Contract Architecture

### 1. Escrow Contract (Main Betting Pool)

```rust
// Simplified Solana Program structure
#[account]
pub struct BetPool {
    pub bet_id: String,           // Reference to Bet entity
    pub total_pool: u64,          // Total SOL locked (in lamports)
    pub lp_amount_a: u64,
    pub lp_amount_b: u64,
    pub lp_amount_draw: u64,
    pub status: BetStatus,
    pub winning_outcome: Option<Outcome>,
    pub bump: u8,
}

#[account]
pub struct UserPosition {
    pub user: Pubkey,             // User's wallet address
    pub bet_pool: Pubkey,
    pub outcome: Outcome,
    pub amount: u64,
    pub potential_payout: u64,
    pub status: PositionStatus,
}
```

### 2. Key Functions to Implement

#### A. `create_bet_offer`
- User deposits SOL into escrow
- Creates LP position
- Updates BetPool liquidity

#### B. `match_bet`
- Matcher deposits SOL against existing offer
- Locks both positions
- Calculates odds based on liquidity ratio

#### C. `claim_winnings`
- Verifies bet is settled and user won
- Transfers payout from escrow to user wallet
- Marks position as claimed

#### D. `settle_bet` (Admin/Oracle only)
- Called after oracle confirms match result
- Updates BetPool with winning outcome
- Triggers automatic payouts

## Oracle Integration

### Recommended Oracle: Pyth Network or Switchboard

**Why Pyth:**
- Real-time sports data feeds
- Low latency (< 1 second)
- Decentralized publisher network
- Already integrated with major Solana protocols

### Implementation Flow:

1. **Match Creation**
   ```javascript
   // In functions/settleBetWithOracle.js
   const pythPriceFeed = "0x..."; // Pyth feed for match result
   
   // Fetch result from Pyth
   const result = await pythClient.getPrice(pythPriceFeed);
   
   // Verify result matches expected format
   // Auto-settle based on oracle data
   ```

2. **Automatic Settlement**
   ```rust
   // In Solana program
   pub fn settle_with_oracle(ctx: Context<SettleBet>) -> Result<()> {
       let oracle_data = ctx.accounts.oracle_account.data;
       let result = parse_oracle_result(oracle_data)?;
       
       // Update bet pool
       bet_pool.winning_outcome = Some(result);
       bet_pool.status = BetStatus::Settled;
       
       // Auto-distribute winnings
       distribute_winnings(ctx)?;
       
       Ok(())
   }
   ```

## Deployment Steps

### Step 1: Deploy Smart Contracts

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Initialize project
anchor init elevenx-betting
cd elevenx-betting

# Deploy to devnet first
anchor deploy --provider.cluster devnet

# Then to mainnet
anchor deploy --provider.cluster mainnet
```

### Step 2: Update Backend Functions

Replace database-only operations with smart contract calls:

```javascript
// Example: functions/matchBet.js
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

Deno.serve(async (req) => {
  // ... existing validation ...
  
  // Call smart contract
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const transaction = new Transaction();
  
  // Add instruction to call match_bet on your program
  const programId = new PublicKey('YOUR_PROGRAM_ID');
  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: userWallet, isSigner: true, isWritable: true },
      { pubkey: betPoolKey, isSigner: false, isWritable: true },
      // ... other accounts ...
    ],
    data: Buffer.from([...])
  });
  
  transaction.add(instruction);
  
  // Send transaction
  const signature = await connection.sendTransaction(transaction, [wallet]);
  await connection.confirmTransaction(signature);
  
  return Response.json({ success: true, signature });
});
```

### Step 3: Oracle Setup

1. **Pyth Network Integration**
   ```bash
   npm install @pythnetwork/client
   ```

2. **Configure Price Feeds**
   - Register for Pyth data feeds
   - Get feed IDs for each match type
   - Set up webhook listeners

3. **Automated Settlement**
   ```javascript
   // Create automation to check oracle results
   create_automation({
     automation_type: "scheduled",
     name: "Check Match Results",
     function_name: "settleBetWithOracle",
     repeat_interval: 5,
     repeat_unit: "minutes",
   });
   ```

## Security Considerations

1. **Multi-Sig Admin**
   - Use Solana multi-sig for admin functions
   - Require 2/3 signatures for settlements

2. **Timelock**
   - Add 24-hour delay before payouts
   - Allow users to dispute results

3. **Emergency Pause**
   - Implement circuit breaker for critical bugs
   - Admin can pause all betting

## Testing Checklist

- [ ] Deploy to Solana devnet
- [ ] Test wallet connection with Phantom
- [ ] Create test bets with devnet SOL
- [ ] Verify oracle data fetching
- [ ] Test payout distribution
- [ ] Audit smart contracts (OtterSec or Neodyme)

## Production Launch

1. Complete security audit
2. Deploy to Solana mainnet
3. Migrate existing test data
4. Monitor with Solana FM or Solscan
5. Set up alerts for large transactions

## Resources

- [Solana Program Documentation](https://solana.com/developers/guides/javascript)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Pyth Network Docs](https://docs.pyth.network/)
- [Phantom Wallet Integration](https://docs.phantom.app/)

---

**Current Status**: Backend logic complete. Ready for smart contract development and deployment.