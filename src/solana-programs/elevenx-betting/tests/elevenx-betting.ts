import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ElevenxBetting } from "../target/types/elevenx_betting";
import { expect } from "chai";

describe("elevenx-betting", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ElevenxBetting as Program<ElevenxBetting>;
  const admin = provider.wallet.publicKey;

  it("Initializes a bet pool", async () => {
    const betId = "bet_001";
    const matchId = "match_001";

    const [betPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    await program.methods
      .initializeBetPool({ betId, matchId })
      .accounts({
        betPool: betPoolPda,
        admin: admin,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const betPool = await program.account.betPool.fetch(betPoolPda);
    expect(betPool.betId).to.equal(betId);
    expect(betPool.matchId).to.equal(matchId);
    expect(betPool.totalPool.toNumber()).to.equal(0);
    expect(betPool.feePercent).to.equal(0); // 0% fee
    expect(betPool.status).to.deep.equal({ open: {} });
  });

  it("Creates a bet offer (LP deposits SOL to the pool", async () => {
    const betId = "bet_001";
    const [betPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    const user = anchor.web3.Keypair.generate();
    const amount = new anchor.BN(1_000_000_000); // 1 SOL in lamports

    const [userPositionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), user.publicKey.toBuffer(), Buffer.from(betId)],
      program.programId
    );

    // Airdrop SOL to user for testing
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 2_000_000_000)
    );

    await program.methods
      .createBetOffer({
        betId,
        outcome: { a: {} },
        amount,
      })
      .accounts({
        betPool: betPoolPda,
        userPosition: userPositionPda,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const userPosition = await program.account.userPosition.fetch(userPositionPda);
    expect(userPosition.amount.toNumber()).to.equal(amount.toNumber());
    expect(userPosition.status).to.deep.equal({ pending: {} });

    const betPool = await program.account.betPool.fetch(betPoolPda);
    expect(betPool.lpAmountA.toNumber()).to.equal(amount.toNumber());
  });

  it("Matches a bet against existing offer", async () => {
    // This test would verify the match_bet instruction
    // Implementation depends on the existing offer from previous test
    console.log("✅ Match bet test - implementation pending");
  });

  it("Settles the bet pool", async () => {
    const betId = "bet_001";
    const [betPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bet_pool"), Buffer.from(betId)],
      program.programId
    );

    await program.methods
      .settleBet({ winningOutcome: { a: {} } })
      .accounts({
        betPool: betPoolPda,
        admin: admin,
      })
      .rpc();

    const betPool = await program.account.betPool.fetch(betPoolPda);
    expect(betPool.status).to.deep.equal({ settled: {} });
    expect(betPool.winningOutcome).to.deep.equal({ a: {} });
  });

  it("Allows winner to claim winnings", async () => {
    // This test would verify the claim_winnings instruction
    console.log("✅ Claim winnings test - implementation pending");
  });
});