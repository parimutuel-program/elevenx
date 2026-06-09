use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;

use instructions::*;

declare_id!("4qyCfiThJaaRGmNCaJSGbPei5fENytMBtbvquv57Z4v6");

#[program]
pub mod elevenx_betting {
    use super::*;

    // ── Factory / Market lifecycle ──────────────────────────────────────────

    /// Initialize the global platform config (fee vault + admin).
    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        fee_percent: u16,
    ) -> Result<()> {
        instructions::platform::initialize_platform(ctx, fee_percent)
    }

    /// Create a new bet market for a match.
    pub fn create_market(
        ctx: Context<CreateMarket>,
        params: CreateMarketParams,
    ) -> Result<()> {
        instructions::market::create_market(ctx, params)
    }

    /// Pause / unpause a market (admin only).
    pub fn set_market_paused(ctx: Context<SetMarketPaused>, paused: bool) -> Result<()> {
        instructions::market::set_market_paused(ctx, paused)
    }

    /// Void a market — enables full refunds (admin only).
    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        instructions::market::void_market(ctx)
    }

    /// Update market timestamps (admin only, for testing/recovery).
    pub fn update_market_timestamps(
        ctx: Context<UpdateMarketTimestamps>,
        open_until: i64,
        settle_after: i64,
    ) -> Result<()> {
        instructions::market::update_market_timestamps(ctx, open_until, settle_after)
    }

    // ── Liquidity (LP) ──────────────────────────────────────────────────────

    /// LP deposits SOL to cover bettors on a specific outcome at oracle odds.
    pub fn provide_liquidity(ctx: Context<ProvideLiquidity>, outcome: u8, amount: u64) -> Result<()> {
        instructions::liquidity::provide_liquidity(ctx, outcome, amount)
    }

    /// LP withdraws unmatched liquidity before market closes.
    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>) -> Result<()> {
        instructions::liquidity::withdraw_liquidity(ctx)
    }

    // ── Betting ─────────────────────────────────────────────────────────────

    /// Place a bet on a specific outcome (0, 1, or 2) at the oracle fixed odds.
    /// Stake is matched against available LP liquidity immediately; any remainder
    /// enters a pending state until more liquidity is provided.
    pub fn place_bet(ctx: Context<PlaceBet>, outcome: u8, amount: u64) -> Result<()> {
        instructions::betting::place_bet(ctx, outcome, amount)
    }

    // ── Oracle / Settlement ─────────────────────────────────────────────────

    /// Oracle signer submits a vote for the winning outcome.
    /// Settlement executes automatically when consensus threshold is reached.
    pub fn submit_oracle_vote(
        ctx: Context<SubmitOracleVote>,
        winning_outcome: u8,
    ) -> Result<()> {
        instructions::oracle::submit_oracle_vote(ctx, winning_outcome)
    }

    /// Admin-only: Force-settle a market that was incorrectly voided.
    /// Bypasses settled/voided checks to route funds to fee vault.
    pub fn force_settle_market(
        ctx: Context<ForceSettleMarket>,
        winning_outcome: u8,
    ) -> Result<()> {
        instructions::oracle::force_settle_market(ctx, winning_outcome)
    }

    /// Admin-only: Sweep residual SOL from a settled/voided market to admin wallet.
    pub fn sweep_market_funds(ctx: Context<SweepMarketFunds>) -> Result<()> {
        instructions::market::sweep_market_funds(ctx)
    }

    // ── Claims & Refunds ────────────────────────────────────────────────────

    /// Winner claims their payout after settlement.
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        instructions::claims::claim_winnings(ctx)
    }

    /// Bettor reclaims stake if market was voided.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::claims::refund(ctx)
    }

    /// LP withdraws winnings from a settled market.
    pub fn withdraw_lp_winnings(ctx: Context<WithdrawLpWinnings>, amount: u64) -> Result<()> {
        instructions::claims::withdraw_lp_winnings(ctx, amount)
    }

    // ── Fee Vault ───────────────────────────────────────────────────────────

    /// Admin withdraws accumulated platform fees.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        instructions::fees::withdraw_fees(ctx, amount)
    }
}