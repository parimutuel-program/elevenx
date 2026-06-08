use anchor_lang::prelude::*;
use crate::state::{PlatformConfig, FeeVault};
use crate::errors::BettingError;

// ── initialize_platform ──────────────────────────────────────────────────────

pub fn initialize_platform(ctx: Context<InitializePlatform>, fee_percent: u16) -> Result<()> {
    require!(fee_percent <= PlatformConfig::MAX_FEE_PERCENT, BettingError::FeeTooHigh);

    let config = &mut ctx.accounts.platform_config;
    config.admin = ctx.accounts.admin.key();
    config.fee_percent = fee_percent;
    config.consensus_threshold = 1; // default: 1 admin oracle (single-signer settlement)
    config.total_fees_lamports = 0;
    config.bump = ctx.bumps.platform_config;

    let vault = &mut ctx.accounts.fee_vault;
    vault.admin = ctx.accounts.admin.key();
    vault.total_fees = 0;
    vault.bump = ctx.bumps.fee_vault;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = admin,
        space = PlatformConfig::LEN,
        seeds = [b"platform"],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        init,
        payer = admin,
        space = FeeVault::LEN,
        seeds = [b"fee_vault"],
        bump,
    )]
    pub fee_vault: Account<'info, FeeVault>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}