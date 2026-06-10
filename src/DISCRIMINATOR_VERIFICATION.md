# Discriminator & Account Layout Verification

## Verified Against claims.rs

### 1. refund (Bettor Refund on Voided Market)

**Discriminator**: `[2, 96, 183, 251, 63, 208, 46, 46]` ✅

**Account Layout** (from claims.rs lines 208-227):
```rust
pub struct Refund<'info> {
    #[account(mut, seeds = [b"market", ...])]
    pub market: Account<'info, BetMarket>,          // writable
    
    #[account(mut, seeds = [b"position", ...])]
    pub bet_position: Account<'info, BetPosition>,  // writable
    
    #[account(mut, constraint = bettor.key() == bet_position.bettor)]
    pub bettor: UncheckedAccount<'info>,            // signer, writable
    
    pub system_program: Program<'info, System>,     // readonly
}
```

**Backend Implementation** (functions/refund):
- ✅ market (writable)
- ✅ bet_position (writable)
- ✅ bettor (signer, writable)
- ✅ system_program (readonly)

**Instruction Data**: discriminator (8 bytes) + outcome (1 byte u8) = 9 bytes total

---

### 2. refund_lp (LP Refund on Voided Market)

**Discriminator**: `[173, 60, 2, 235, 56, 23, 75, 182]` ✅

**Account Layout** (from claims.rs lines 257-276):
```rust
pub struct RefundLp<'info> {
    #[account(mut, seeds = [b"market", ...])]
    pub market: Account<'info, BetMarket>,          // writable
    
    #[account(mut, seeds = [b"lp_offer", ...])]
    pub lp_offer: Account<'info, LpOffer>,          // writable
    
    #[account(mut, constraint = lp_wallet.key() == lp_offer.lp)]
    pub lp_wallet: UncheckedAccount<'info>,         // signer, writable
    
    pub system_program: Program<'info, System>,     // readonly
}
```

**Backend Implementation** (functions/refundLp):
- ✅ market (writable)
- ✅ lp_offer (writable)
- ✅ lp_wallet (signer, writable)
- ✅ system_program (readonly)

**Instruction Data**: discriminator (8 bytes) only = 8 bytes total

---

## Discriminator Reference Table

| Instruction | Discriminator (Decimal) | Discriminator (Hex) |
|-------------|------------------------|---------------------|
| claim_winnings | `[161, 215, 24, 59, 14, 236, 242, 221]` | `a1d7183b0ecef2dd` |
| withdraw_lp_winnings | `[10, 224, 253, 15, 227, 173, 172, 25]` | `0ae0fd0fe3adac19` |
| withdraw_liquidity | `[10, 224, 253, 15, 227, 173, 172, 25]` | `0ae0fd0fe3adac19` |
| **refund** | `[2, 96, 183, 251, 63, 208, 46, 46]` | `0260b7fb3fd02e2e` |
| **refund_lp** | `[173, 60, 2, 235, 56, 23, 75, 182]` | `ad3c02eb38174bb6` |

---

## Verification Status

✅ **refund** - Discriminator updated, account layout matches claims.rs
✅ **refundLp** - Discriminator updated, account layout matches claims.rs

Both functions deployed and responding (tested with test_backend_function).