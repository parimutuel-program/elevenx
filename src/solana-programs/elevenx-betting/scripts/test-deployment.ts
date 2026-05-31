import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ElevenxBetting } from "../target/types/elevenx_betting";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("elevenx-betting", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ElevenxBetting as Program<ElevenxBetting>;

  it("Initialize Bet Pool", async () => {
    const betId = "test-bet-001";
    const matchId = "match-001";
    const admin = provider.wallet.publicKey;

    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    await program.methods
      .initializeBetPool({
        betId,
        matchId,
      })
      .accounts({
        betPool: betPoolPda,
        admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const betPool = await program.account.betPool.fetch(betPoolPda);
    assert.equal(betPool.betId, betId);
    assert.equal(betPool.matchId, matchId);
    assert.equal(betPool.totalPool.toNumber(), 0);
    assert.equal(betPool.status.toString(), "open");
  });

  it("Create Bet Offer", async () => {
    const betId = "test-bet-001";
    const matchId = "match-001";
    const user = provider.wallet.publicKey;
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    const [userPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), user.toBuffer(), Buffer.from(betId)],
      program.programId
    );

    await program.methods
      .createBetOffer({
        outcome: { a: {} },
        amount,
        betId,
      })
      .accounts({
        betPool: betPoolPda,
        userPosition: userPositionPda,
        user,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const userPosition = await program.account.userPosition.fetch(userPositionPda);
    assert.equal(userPosition.amount.toNumber(), amount.toNumber());
    assert.equal(userPosition.outcome.toString(), "a");

    const betPool = await program.account.betPool.fetch(betPoolPda);
    assert.equal(betPool.lpAmountA.toNumber(), amount.toNumber());
    assert.equal(betPool.totalPool.toNumber(), amount.toNumber());
  });

  it("Match Bet", async () => {
    const betId = "test-bet-001";
    const matchId = "match-001";
    const matcher = provider.wallet.publicKey;
    const amount = new anchor.BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL

    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    const [existingPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), matcher.toBuffer(), Buffer.from(betId)],
      program.programId
    );

    const [matcherPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), matcher.toBuffer(), Buffer.from(betId)],
      program.programId
    );

    // This would need the actual LP's position PDA
    // For testing, we'd create a second account
    console.log("Match bet test requires multi-account setup");
  });

  it("Settle Bet", async () => {
    const betId = "test-bet-001";
    const admin = provider.wallet.publicKey;

    const [betPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    await program.methods
      .settleBet({
        winningOutcome: { a: {} },
      })
      .accounts({
        betPool: betPoolPda,
        admin,
      })
      .rpc();

    const betPool = await program.account.betPool.fetch(betPoolPda);
    assert.equal(betPool.status.toString(), "settled");
    assert.equal(betPool.winningOutcome.toString(), "a");
  });
});