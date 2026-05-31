use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("ElevenX1111111111111111111111111111111111111");

#[program]
pub mod elevenx_betting {
    use super::*;

    pub fn initialize_bet_pool(ctx: Context<InitializeBetPool>, params: InitializeBetPoolParams) -> Result<()> {
        let bet_pool = &mut ctx.accounts.bet_pool;
        bet_pool.bet_id = params.bet_id;
        bet_pool.match_id = params.match_id;
        bet_pool.total_pool = 0;
        bet_pool.lp_amount_a = 0;
        bet_pool.lp_amount_b = 0;
        bet_pool.lp_amount_draw = 0;
        bet_pool.status = BetStatus::Open;
        bet_pool.winning_outcome = None;
        bet_pool.fee_percent = 200; // 2%
        bet_pool.bump = ctx.bumps.bet_pool;
        Ok(())
    }

    pub fn create_bet_offer(ctx: Context<CreateBetOffer>, params: CreateBetOfferParams) -> Result<()> {
        let bet_pool = &mut ctx.accounts.bet_pool;
        let user_position = &mut ctx.accounts.user_position;

        // Initialize user position
        user_position.user = ctx.accounts.user.key();
        user_position.bet_pool = ctx.accounts.bet_pool.key();
        user_position.outcome = params.outcome;
        user_position.amount = params.amount;
        user_position.potential_payout = 0;
        user_position.status = PositionStatus::Pending;
        user_position.bump = ctx.bumps.user_position;

        // Transfer SOL from user to bet pool
        let transfer_ix = system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.bet_pool.key(),
            params.amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.bet_pool.to_account_info(),
            ],
        )?;

        // Update pool liquidity based on outcome
        match params.outcome {
            Outcome::A => bet_pool.lp_amount_a += params.amount,
            Outcome::B => bet_pool.lp_amount_b += params.amount,
            Outcome::Draw => bet_pool.lp_amount_draw += params.amount,
        }

        bet_pool.total_pool += params.amount;
        Ok(())
    }

    pub fn match_bet(ctx: Context<MatchBet>, params: MatchBetParams) -> Result<()> {
        let bet_pool = &mut ctx.accounts.bet_pool;
        let existing_position = &mut ctx.accounts.existing_position;
        let matcher_position = &mut ctx.accounts.matcher_position;

        // Validate amount doesn't exceed available
        require!(
            params.amount <= existing_position.amount - existing_position.matched_amount,
            BettingError::AmountExceedsAvailable
        );

        // Initialize matcher position
        matcher_position.user = ctx.accounts.matcher.key();
        matcher_position.bet_pool = ctx.accounts.bet_pool.key();
        matcher_position.outcome = params.matcher_outcome;
        matcher_position.amount = params.amount;
        matcher_position.potential_payout = 0; // Will be calculated
        matcher_position.status = PositionStatus::Active;
        matcher_position.bump = ctx.bumps.matcher_position;

        // Transfer SOL from matcher to pool
        let transfer_ix = system_instruction::transfer(
            &ctx.accounts.matcher.key(),
            &ctx.accounts.bet_pool.key(),
            params.amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.matcher.to_account_info(),
                ctx.accounts.bet_pool.to_account_info(),
            ],
        )?;

        // Update matched amount
        existing_position.matched_amount += params.amount;
        if existing_position.matched_amount >= existing_position.amount {
            existing_position.status = PositionStatus::FullyMatched;
        } else {
            existing_position.status = PositionStatus::PartiallyMatched;
        }

        bet_pool.total_pool += params.amount;

        // Calculate potential payout for matcher
        let odds = calculate_odds(bet_pool, params.matcher_outcome)?;
        let winnings = (params.amount as f64 * odds) as u64;
        let fee = (winnings * bet_pool.fee_percent as u64) / 10000;
        matcher_position.potential_payout = params.amount + winnings - fee;

        Ok(())
    }

    pub fn settle_bet(ctx: Context<SettleBet>, params: SettleBetParams) -> Result<()> {
        let bet_pool = &mut ctx.accounts.bet_pool;
        
        require!(
            ctx.accounts.admin.key() == ctx.accounts.admin.key(),
            BettingError::Unauthorized
        );

        bet_pool.winning_outcome = Some(params.winning_outcome);
        bet_pool.status = BetStatus::Settled;

        // Mark winning positions for payout
        // Actual distribution happens in claim_winnings
        Ok(())
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let user_position = &mut ctx.accounts.user_position;
        let bet_pool = &mut ctx.accounts.bet_pool;

        require!(
            bet_pool.status == BetStatus::Settled,
            BettingError::BetNotSettled
        );
        require!(
            user_position.status == PositionStatus::Won,
            BettingError::PositionNotWon
        );

        let payout_amount = user_position.potential_payout;

        // Transfer payout from pool to user
        let transfer_ix = system_instruction::transfer(
            &bet_pool.to_account_info().key,
            &ctx.accounts.user.key(),
            payout_amount,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &transfer_ix,
            &[
                bet_pool.to_account_info(),
                ctx.accounts.user.to_account_info(),
            ],
            &[&[b"bet_pool", bet_pool.bet_id.as_bytes(), &[bet_pool.bump]]],
        )?;

        user_position.status = PositionStatus::Claimed;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(params: InitializeBetPoolParams)]
pub struct InitializeBetPool<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + BetPool::INIT_SPACE,
        seeds = [b"bet_pool", params.bet_id.as_bytes()],
        bump
    )]
    pub bet_pool: Account<'info, BetPool>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: CreateBetOfferParams)]
pub struct CreateBetOffer<'info> {
    #[account(mut)]
    pub bet_pool: Account<'info, BetPool>,
    #[account(
        init,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"user_position", user.key().as_ref(), params.bet_id.as_bytes()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: MatchBetParams)]
pub struct MatchBet<'info> {
    #[account(mut)]
    pub bet_pool: Account<'info, BetPool>,
    #[account(mut)]
    pub existing_position: Account<'info, UserPosition>,
    #[account(
        init,
        payer = matcher,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"user_position", matcher.key().as_ref(), params.bet_id.as_bytes()],
        bump
    )]
    pub matcher_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub matcher: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleBet<'info> {
    #[account(mut)]
    pub bet_pool: Account<'info, BetPool>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub bet_pool: Account<'info, BetPool>,
    #[account(
        mut,
        has_one = user,
        seeds = [b"user_position", user.key().as_ref(), bet_pool.bet_id.as_bytes()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct BetPool {
    #[max_len(50)]
    pub bet_id: String,
    #[max_len(50)]
    pub match_id: String,
    pub total_pool: u64,
    pub lp_amount_a: u64,
    pub lp_amount_b: u64,
    pub lp_amount_draw: u64,
    pub status: BetStatus,
    pub winning_outcome: Option<Outcome>,
    pub fee_percent: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub user: Pubkey,
    pub bet_pool: Pubkey,
    pub outcome: Outcome,
    pub amount: u64,
    pub matched_amount: u64,
    pub potential_payout: u64,
    pub status: PositionStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BetStatus {
    Open,
    Closed,
    Settled,
    Void,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Outcome {
    A,
    B,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PositionStatus {
    Pending,
    Active,
    PartiallyMatched,
    FullyMatched,
    Won,
    Lost,
    Claimed,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeBetPoolParams {
    pub bet_id: String,
    pub match_id: String,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateBetOfferParams {
    pub outcome: Outcome,
    pub amount: u64,
    pub bet_id: String,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MatchBetParams {
    pub amount: u64,
    pub matcher_outcome: Outcome,
    pub bet_id: String,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleBetParams {
    pub winning_outcome: Outcome,
}

#[error_code]
pub enum BettingError {
    #[msg("Amount exceeds available liquidity")]
    AmountExceedsAvailable,
    #[msg("Bet not yet settled")]
    BetNotSettled,
    #[msg("Position did not win")]
    PositionNotWon,
    #[msg("Unauthorized access")]
    Unauthorized,
}

fn calculate_odds(bet_pool: &BetPool, outcome: Outcome) -> Result<f64> {
    let (own_liquidity, opposing_liquidity) = match outcome {
        Outcome::A => (bet_pool.lp_amount_a, bet_pool.lp_amount_b + bet_pool.lp_amount_draw),
        Outcome::B => (bet_pool.lp_amount_b, bet_pool.lp_amount_a + bet_pool.lp_amount_draw),
        Outcome::Draw => (bet_pool.lp_amount_draw, bet_pool.lp_amount_a + bet_pool.lp_amount_b),
    };

    if own_liquidity == 0 || opposing_liquidity == 0 {
        return Ok(0.0);
    }

    Ok(opposing_liquidity as f64 / own_liquidity as f64)
}