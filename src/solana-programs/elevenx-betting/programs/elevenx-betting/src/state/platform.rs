use anchor_lang::prelude::*;

/// Global platform config — one per program deployment.
/// PDA seeds: ["platform"]
#[account]
#[derive(Default)]
pub struct PlatformConfig {
    /// The admin authority (can settle, void, withdraw fees).
    pub admin: Pubkey,

    /// Default fee in basis points applied to winnings (200 = 2%).
    pub fee_percent: u16,

    /// How many oracle signers must agree before settlement fires.
    pub consensus_threshold: u8,

    /// Total fees accumulated in the fee vault lamports.
    pub total_fees_lamports: u64,

    pub bump: u8,
}

impl PlatformConfig {
    pub const MAX_FEE_PERCENT: u16 = 200; // Max 2% (200 basis points)
    pub const LEN: usize = 8  // discriminator
        + 32  // admin
        + 2   // fee_percent
        + 1   // consensus_threshold
        + 8   // total_fees_lamports
        + 1;  // bump
}