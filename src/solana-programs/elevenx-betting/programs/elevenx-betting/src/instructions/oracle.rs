use anchor_lang::prelude::*;
use crate::state::{BetMarket, PlatformConfig, FeeVault};
use crate::errors::BettingError;

// Switchboard On-Demand SDK — verify import path matches your pinned version
use switchboard_on_demand::PullFeedAccountData;

// ── Internal settlement logic (shared by oracle + emergency paths) ────────────

fn execute_settlement(
    market: &mut BetMarket,
    winning_outcome: u8,
    fee_vault: &mut FeeVault,
) -> Result<()> {
    market.settled = true;
    market.winning_outcome = winning_outcome;
    market.settlement_finalized = true;

    let winners_pool = market.total_matched[winning_outcome as usize];

    if winners_pool == 0 {
        let total_losers: u64 = market.total_matched.iter().sum();
        fee_vault.total_fees = fee_vault.total_fees.saturating_add(total_losers);
        market.accrued_fees = total_losers;

        let market_lamports = **market.to_account_info().try_borrow_mut_lamports()?;
        let transfer_amount = market_lamports.min(total_losers);
        **market.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
        **fee_vault.to_account_info().try_borrow_mut_lamports()? += transfer_amount;
        return Ok(());
    }

    let total_all: u64 = market.total_matched.iter().sum();
    let losers_pool = total_all.saturating_sub(winners_pool);
    let fee_percent = market.fee_percent as u64;
    let estimated_fees = losers_pool
        .checked_mul(fee_percent)
        .and_then(|v| v.checked_div(10_000))
        .unwrap_or(0);
    market.accrued_fees = estimated_fees;
    Ok(())
}

// ── settle_from_oracle ────────────────────────────────────────────────────────
// Permissionless settlement via Switchboard On-Demand feed.
// SECURITY: Removes admin discretion — outcome is determined by verified oracle.

pub fn settle_from_oracle(ctx: Context<SettleFromOracle>) -> Result<()> {
    let clock = Clock::get()?;

    {
        let market = &ctx.accounts.market;
        require!(!market.settled && !market.voided, BettingError::AlreadySettled);
        require!(clock.unix_timestamp >= market.settle_after, BettingError::TooEarlyToSettle);
    }

    // ── SECURITY: verify feed account is genuinely Switchboard ────────────────
    let feed_account = ctx.accounts.feed.to_account_info();
    let feed = PullFeedAccountData::parse(feed_account)
        .map_err(|_| error!(BettingError::InvalidOracleAccount))?;

    // ── SECURITY: staleness + min samples ─────────────────────────────────────
    let max_stale_slots: u64 = 250;  // ~100s at ~0.4s/slot
    let min_samples: u32 = 1;

    let raw = feed
        .get_value(&clock, max_stale_slots, min_samples, true)
        .map_err(|_| error!(BettingError::OracleNotReady))?;

    // ── Map numeric feed result to outcome enum ───────────────────────────────
    let as_int: i64 = raw
        .try_into()
        .map_err(|_| error!(BettingError::InvalidOracleResult))?;

    require!(as_int >= 0, BettingError::InvalidOracleResult);
    let winning_outcome = as_int as u8;

    {
        let market = &ctx.accounts.market;
        require!(winning_outcome < market.outcome_count, BettingError::InvalidOracleResult);
    }

    let market = &mut ctx.accounts.market;
    let fee_vault = &mut ctx.accounts.fee_vault;
    execute_settlement(market, winning_outcome, fee_vault)?;

    Ok(())
}

// ── force_void_market ────────────────────────────────────────────────────────
// Admin-only: Emergency recovery to VOID a stuck market (NOT settle).
// SECURITY FIX: Admin can only void (refund all), not pick winners.

pub fn force_void_market(ctx: Context<ForceVoidMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;
    
    require!(!market.settled, BettingError::AlreadySettled);
    require!(!market.voided, BettingError::MarketVoided);
    require!(clock.unix_timestamp >= market.settle_after, BettingError::TooEarlyToSettle);

    market.voided = true;
    market.settled = true;
    
    Ok(())
}


// ── SettleFromOracle Accounts ────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SettleFromOracle<'info> {
    #[account(
        mut,
        seeds = [b"market", market.match_id.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(mut, seeds = [b"fee_vault"], bump = fee_vault.bump)]
    pub fee_vault: Account<'info, FeeVault>,

    /// CHECK: Switchboard On-Demand feed account — validated via parse() + address constraint.
    /// CRITICAL: The feed pubkey MUST be pinned to the market at creation to prevent
    /// an attacker from passing a different (but valid) Switchboard feed.
    #[account(address = market.settlement_feed @ BettingError::InvalidOracleAccount)]
    pub feed: AccountInfo<'info>,

    /// Permissionless cranker — anyone can call this.
    #[account(mut)]
    pub cranker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── ForceVoidMarket Accounts ────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ForceVoidMarket<'info> {
    #[account(
        mut,
        seeds = [b"market", market.match_id.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(constraint = admin.key() == platform_config.admin @ BettingError::Unauthorized)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── TEST ONLY: test_announce_winner ─────────────────────────────────────────
// Admin-only test helper for devnet testing. Compiled OUT of mainnet builds.

#[cfg(feature = "testing")]
pub fn test_announce_winner(ctx: Context<TestAnnounceWinner>, winning_outcome: u8) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let fee_vault = &mut ctx.accounts.fee_vault;
    require!(winning_outcome < market.outcome_count, BettingError::InvalidOutcome);
    require!(!market.settled && !market.voided, BettingError::AlreadySettled);
    execute_settlement(market, winning_outcome, fee_vault)?;
    Ok(())
}

#[cfg(feature = "testing")]
#[derive(Accounts)]
pub struct TestAnnounceWinner<'info> {
    #[account(
        mut,
        seeds = [b"market", market.match_id.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(mut, seeds = [b"fee_vault"], bump = fee_vault.bump)]
    pub fee_vault: Account<'info, FeeVault>,

    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(mut, constraint = admin.key() == platform_config.admin @ BettingError::Unauthorized)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}