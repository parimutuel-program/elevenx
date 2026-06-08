use anchor_lang::prelude::*;
use crate::state::{BetMarket, BetPosition, FeeVault, LpOffer, PlatformConfig};
use crate::errors::BettingError;

// ── claim_winnings ────────────────────────────────────────────────────────────
pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &ctx.accounts.bet_position;

    require!(market.settled && !market.voided, BettingError::AlreadySettled);
    require!(!position.claimed, BettingError::ClaimNothing);
    require!(
        position.outcome == market.winning_outcome,
        BettingError::ClaimNothing
    );
    require!(position.matched_stake > 0, BettingError::ClaimNothing);

    let gross = position.potential_payout;
    require!(gross > 0, BettingError::ClaimNothing);

    let fee_percent = market.fee_percent as u64;
    let fee = gross
        .checked_mul(fee_percent)
        .and_then(|v| v.checked_div(10_000))
        .unwrap_or(0);
    let payout = gross.saturating_sub(fee);

    let pending_refund = position.pending_stake;
    let total_transfer = payout.checked_add(pending_refund).ok_or(BettingError::Overflow)?;

    let position_mut = &mut ctx.accounts.bet_position;
    position_mut.claimed = true;
    position_mut.claimable = payout;

    if fee > 0 {
        let fee_vault = &mut ctx.accounts.fee_vault;
        **ctx.accounts.market.to_account_info().try_borrow_mut_lamports()? -= fee;
        **fee_vault.to_account_info().try_borrow_mut_lamports()? += fee;
    }

    **ctx.accounts.market.to_account_info().try_borrow_mut_lamports()? -= total_transfer;
    **ctx.accounts.bettor.try_borrow_mut_lamports()? += total_transfer;

    Ok(())
}

// ── refund ────────────────────────────────────────────────────────────────────
pub fn refund(ctx: Context<Refund>) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &ctx.accounts.bet_position;

    require!(market.voided, BettingError::NotVoided);
    require!(!position.claimed, BettingError::NothingToRefund);

    let total_stake = position
        .matched_stake
        .checked_add(position.pending_stake)
        .ok_or(BettingError::Overflow)?;
    require!(total_stake > 0, BettingError::NothingToRefund);

    let position_mut = &mut ctx.accounts.bet_position;
    position_mut.claimed = true;
    position_mut.matched_stake = 0;
    position_mut.pending_stake = 0;

    **ctx.accounts.market.to_account_info().try_borrow_mut_lamports()? -= total_stake;
    **ctx.accounts.bettor.try_borrow_mut_lamports()? += total_stake;

    Ok(())
}

// ── withdraw_lp_winnings ─────────────────────────────────────────────────────
pub fn withdraw_lp_winnings(ctx: Context<WithdrawLpWinnings>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let lp_offer = &ctx.accounts.lp_offer;
    let fee_vault = &mut ctx.accounts.fee_vault;

    require!(market.settled && !market.voided, BettingError::AlreadySettled);

    // CORRECTED: LP wins when the bettors on their backed outcome LOST (LP collects losing stakes).
    // LP backs outcome X — if outcome X LOST, LP wins.
    require!(
        lp_offer.outcome != market.winning_outcome,
        BettingError::ClaimNothing
    );

    // Use amount_matched as source of winnings (losing bettor stakes matched to this LP)
    let available_winnings = lp_offer.amount_matched;
    require!(available_winnings > 0, BettingError::ClaimNothing);
    
    // FIX: Check remaining withdrawable amount (total winnings - already withdrawn)
    let remaining_withdrawable = available_winnings
        .checked_sub(lp_offer.withdrawn_amount)
        .ok_or(BettingError::Overflow)?;
    require!(remaining_withdrawable > 0, BettingError::ClaimNothing);
    require!(amount <= remaining_withdrawable, BettingError::ClaimNothing);

    let fee_percent = market.fee_percent as u64;
    let fee = amount
        .checked_mul(fee_percent)
        .and_then(|v| v.checked_div(10_000))
        .unwrap_or(0);
    let payout = amount.saturating_sub(fee);

    let lp_offer_mut = &mut ctx.accounts.lp_offer;
    
    // FIX: Track withdrawn amount instead of boolean flag to allow partial withdrawals
    lp_offer_mut.withdrawn_amount = lp_offer_mut
        .withdrawn_amount
        .checked_add(amount)
        .ok_or(BettingError::Overflow)?;
    
    // Only mark as fully withdrawn if all winnings have been withdrawn
    lp_offer_mut.fully_withdrawn = lp_offer_mut.withdrawn_amount >= lp_offer_mut.amount_matched;

    if fee > 0 {
        **ctx.accounts.market.to_account_info().try_borrow_mut_lamports()? -= fee;
        **fee_vault.to_account_info().try_borrow_mut_lamports()? += fee;
    }

    **ctx.accounts.market.to_account_info().try_borrow_mut_lamports()? -= payout;
    **ctx.accounts.lp_wallet.try_borrow_mut_lamports()? += payout;

    Ok(())
}



// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(outcome: u8)]
pub struct ClaimWinnings<'info> {
    #[account(
        mut,
        seeds = [b"market", market.match_id.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), bettor.key().as_ref(), &[outcome]],
        bump = bet_position.bump,
    )]
    pub bet_position: Account<'info, BetPosition>,

    #[account(mut, seeds = [b"fee_vault"], bump = fee_vault.bump)]
    pub fee_vault: Account<'info, FeeVault>,

    /// CHECK: Lamport transfer to bettor; address verified against bet_position.
    #[account(mut, constraint = bettor.key() == bet_position.bettor @ BettingError::Unauthorized)]
    pub bettor: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: u8)]
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [b"market", market.match_id.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), bettor.key().as_ref(), &[outcome]],
        bump = bet_position.bump,
    )]
    pub bet_position: Account<'info, BetPosition>,

    /// CHECK: Lamport transfer to bettor; address verified against bet_position.
    #[account(mut, constraint = bettor.key() == bet_position.bettor @ BettingError::Unauthorized)]
    pub bettor: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawLpWinnings<'info> {
    #[account(
        mut,
        seeds = [b"market", market.match_id.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, BetMarket>,

    #[account(
        mut,
        seeds = [b"lp_offer", market.key().as_ref(), lp_offer.lp.as_ref(), &[lp_offer.outcome]],
        bump = lp_offer.bump,
    )]
    pub lp_offer: Account<'info, LpOffer>,

    #[account(mut, seeds = [b"fee_vault"], bump = fee_vault.bump)]
    pub fee_vault: Account<'info, FeeVault>,

    /// CHECK: Lamport transfer to LP; address verified against lp_offer.lp.
    #[account(mut, constraint = lp_wallet.key() == lp_offer.lp @ BettingError::Unauthorized)]
    pub lp_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}