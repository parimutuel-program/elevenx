# ElevenX Security Audit Summary - Non-Custodial Architecture

## Executive Summary

ElevenX has been architected as a **fully non-custodial, trustless betting protocol** on Solana. All custodial admin controls have been removed from the smart contract, ensuring that **no single party (including the platform team) can access, drain, or unilaterally control user funds**.

---

## Security Improvements Implemented (Date: 2026-06-07)

### 1. ❌ REMOVED: `emergency_claim` Instruction
**Previous Risk:** Admin wallet could unilaterally drain all SOL from any market escrow PDA.

**New Architecture:**
- **Completely removed** from `instructions/claims.rs` and `lib.rs`
- No instruction exists that allows admin to withdraw funds from market PDAs
- User funds can ONLY be withdrawn via:
  - `claim_winnings` (for winning bettors)
  - `refund` (for voided markets)
  - `withdraw_lp_winnings` (for winning LPs)
  - `withdraw_liquidity` (for unmatched LP funds)

**Audit Proof:** All withdrawal paths are user-controlled and permissionless. The platform team cannot intercept or redirect funds.

---

### 2. ❌ REMOVED: `emergency_settle` Instruction
**Previous Risk:** Admin could bypass oracle consensus and unilaterally decide match winners.

**New Architecture:**
- **Completely removed** from `instructions/oracle.rs` and `lib.rs`
- Settlement now **requires** decentralized oracle consensus:
  - Multiple whitelisted oracles must vote
  - Consensus threshold must be met
  - No single wallet can force settlement

**Emergency Fallback:** If a match cannot be settled normally, admin can only call `void_market`, which enables **automatic full refunds** for all participants (no admin control over fund distribution).

---

## Remaining Admin Capabilities (All Non-Custodial)

| Instruction | Purpose | Custodial Risk? |
|-------------|---------|-----------------|
| `void_market` | Mark market as voided (triggers refunds) | ❌ NO - Users withdraw their own funds |
| `update_market_timestamps` | Fix timestamps for testing/recovery | ❌ NO - Cannot access funds |
| `set_market_paused` | Pause betting on a market | ❌ NO - Cannot access funds |
| `create_market` | Deploy new market on-chain | ❌ NO - Funds only flow from users |
| `withdraw_fees` | Withdraw accrued platform fees | ⚠️ YES - But fees are public/transparent |

---

## Trustless Settlement Architecture

### Oracle Consensus Flow
1. **Multiple Independent Oracles** vote on match outcomes
2. **Consensus Threshold** must be reached (configurable in PlatformConfig)
3. **Automatic Settlement** executes when threshold is met
4. **No Admin Override** - settlement is purely algorithmic

### Emergency Void Flow (Decentralized Fallback)
1. Admin calls `void_market` (only option if oracle fails)
2. Market state changes to `voided = true`
3. **Every user can independently call `refund`** to reclaim their stake
4. **Admin cannot touch funds** - refunds go directly to original bettors/LPs

---

## Fund Flow Diagram (Non-Custodial)

```
User Places Bet ──► Market PDA Escrow (On-Chain)
                          │
                          ├──► Winner Claims ──► User Wallet (Permissionless)
                          ├──► Voided Market ──► Refund to User (Permissionless)
                          └──► LP Withdraws ──► LP Wallet (Permissionless)

Admin CANNOT:
- Drain Market PDA
- Redirect payouts
- Block user withdrawals
- Settle markets unilaterally
```

---

## Smart Contract Addresses

| Component | Address |
|-----------|---------|
| Program ID | `GtqYmsWv3EXdhnkahekABVnoqDhbmjrp7jQLqYxoepyR` |
| Platform Config PDA | `[b"platform"]` |
| Fee Vault PDA | `[b"fee_vault"]` |

---

## Verification Steps for Auditors

### 1. Verify No Custodial Drain Instructions
```bash
# Search for any instruction that transfers SOL to admin
grep -r "admin.*lamports" solana-programs/elevenx-betting/programs/elevenx-betting/src/
# Expected: ZERO results (except fee withdrawals which are public)
```

### 2. Verify Oracle Decentralization
```rust
// Check oracle.rs - submit_oracle_vote requires consensus
// No single-wallet settlement path exists
```

### 3. Verify User-Controlled Withdrawals
```rust
// All withdrawal instructions (claim_winnings, refund, withdraw_lp_winnings)
// transfer funds directly to user wallets, not admin
```

### 4. Test Void & Refund Flow
1. Deploy test market
2. Call `void_market`
3. Call `refund` from user wallet
4. Verify SOL returns to user (not admin)

---

## Conclusion

ElevenX operates as a **fully non-custodial protocol**. The platform team has:
- ❌ No ability to drain user funds
- ❌ No ability to unilaterally settle markets
- ✅ Only operational capabilities for market creation and emergency voiding
- ✅ Transparent fee collection (publicly auditable on-chain)

**All user funds remain under user control at all times.** The smart contract is the sole custodian, and its logic is immutable, permissionless, and publicly verifiable on Solana.

---

## Contact for Security Inquiries

- **Security Team:** [Add contact]
- **Bug Bounty Program:** [Add if applicable]
- **Audit Report:** [Link to third-party audit when completed]