use anchor_lang::prelude::*;
use crate::state::{BetMarket, PlatformConfig, VoteTally};
use crate::errors::BettingError;

// ── CreateMarketParams ────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketParams {
    pub match_id: [u8; 32],
    pub outcome_names: [[u8; 32]; 3],
    pub open_until: i64,
    pub settle_after: i64,
    pub fee_percent_override: Option<u16>,
    pub outcome_count: u8,
    pub oracle_odds: [u64; 3],
}

// ── create_market ─────────────────────────────────────────────────────────────

pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    require!(
        params.outcome_count == 2 || params.outcome_count == 3,
        BettingError::InvalidOutcomeCount
    );
    require!(params.open_until < params.settle_after, BettingError::InvalidTimeline);

    let clock = Clock::get()?;
    require!(params.open_until > clock.unix_timestamp, BettingError::BettingClosed);

    let platform = &ctx.accounts.platform_config;
    let fee_percent = if let Some(override_val) = params.fee_percent_override {
        require!(
            override_val <= PlatformConfig::MAX_FEE_PERCENT,
            BettingError::FeeTooHigh
        );
        override_val // Can be Some(0) to remove fees entirely
    } else {
        platform.fee_percent
    };

    let market = &mut ctx.accounts.market;
    market.match_id = params.match_id;
    market.outcome_names = params.outcome_names;
    market.open_until = params.open_until;
    market.settle_after = params.settle_after;
    market.fee_percent = fee_percent;
    market.outcome_count = params.outcome_count;
    market.winning_outcome = 0;
    market.oracle_odds = params.oracle_odds;
    market.total_matched = [0u64; 3];
    market.total_pending = [0u64; 3];
    market.total_lp_committed = 0;
    market.accrued_fees = 0;
    market.settled = false;
    market.voided = false;
    market.paused = false;
    market.settlement_finalized = false;
    market.bump = ctx.bumps.market;

    let tally = &mut ctx.accounts.vote_tally;
    tally.market = market.key();
    tally.votes = [0u8; 3];
    tally.settled = false;
    tally.bump = ctx.bumps.vote_tally;

    Ok(())
}

// ── set_market_paused ─────────────────────────────────────────────────────────

pub fn set_market_paused(ctx: Context<SetMarketPaused>, paused: bool) -> Result<()> {
    ctx.accounts.market.paused = paused;
    Ok(())
}

// ── void_market ───────────────────────────────────────────────────────────────

pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(!market.voided, BettingError::MarketVoided);
    require!(!market.settled, BettingError::AlreadySettled);
    market.voided = true;
    market.settled = true;
    Ok(())
}

// ── update_market_timestamps ──────────────────────────────────────────────────

pub fn update_market_timestamps(
    ctx: Context<UpdateMarketTimestamps>,
    open_until: i64,
    settle_after: i64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(open_until < settle_after, BettingError::InvalidTimeline);
    market.open_until = open_until;
    market.settle_after = settle_after;
    Ok(())
}

// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = admin,
        space = BetMarket::LEN,
        seeds = [b"market", params.match_id.as_ref()],
        bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(
        init,
        payer = admin,
        space = VoteTally::LEN,
        seeds = [b"vote_tally", market.key().as_ref()],
        bump,
    )]
    pub vote_tally: Account<'info, VoteTally>,

    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(mut, constraint = admin.key() == platform_config.admin @ BettingError::Unauthorized)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetMarketPaused<'info> {
    #[account(mut, seeds = [b"market", market.match_id.as_ref()], bump = market.bump)]
    pub market: Account<'info, BetMarket>,

    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(constraint = admin.key() == platform_config.admin @ BettingError::Unauthorized)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct VoidMarket<'info> {
    #[account(mut, seeds = [b"market", market.match_id.as_ref()], bump = market.bump)]
    pub market: Account<'info, BetMarket>,

    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(constraint = admin.key() == platform_config.admin @ BettingError::Unauthorized)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateMarketTimestamps<'info> {
    #[account(mut, seeds = [b"market", market.match_id.as_ref()], bump = market.bump)]
    pub market: Account<'info, BetMarket>,

    #[account(seeds = [b"platform"], bump = platform_config.bump)]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(constraint = admin.key() == platform_config.admin @ BettingError::Unauthorized)]
    pub admin: Signer<'info>,
}