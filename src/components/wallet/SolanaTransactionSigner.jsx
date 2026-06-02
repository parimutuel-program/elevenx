import React, { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Wallet, Loader, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

export default function SolanaTransactionSigner({ instruction, amount, userBetId, offerId, isOffer, isPlatformInit, onSuccess, onError }) {
  // userBetId, offerId, isOffer, isPlatformInit are optional - used for tracking DB records or flow control after transaction
  const { isConnected, connect } = useWallet();
  const [isSigning, setIsSigning] = useState(false);
  const [signature, setSignature] = useState(null);
  const [error, setError] = useState(null);

  const handleSignTransaction = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    setIsSigning(true);
    setError(null);

    try {
      const provider = window.solana;
      
      if (!provider) {
        throw new Error('Phantom wallet not found');
      }

      if (!provider.isConnected) {
        await provider.connect();
      }

      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const transaction = new Transaction();
      
      // Check instruction type and build appropriate transaction
      if (instruction.instruction_type === 'initialize_platform') {
        // Initialize platform config
        console.log('Creating initialize_platform instruction:', instruction);
        console.log('Platform config PDA:', instruction.accounts?.platformConfig);
        console.log('Fee vault PDA:', instruction.accounts?.feeVault);
        console.log('Program ID:', instruction.programId);
        console.log('Admin signer:', provider.publicKey.toBase58());
        
        try {
          const programId = new PublicKey(instruction.programId);
          const platformPda = new PublicKey(instruction.accounts.platformConfig);
          const feeVaultPda = new PublicKey(instruction.accounts.feeVault);
          
          const keys = [
            { pubkey: platformPda, isSigner: false, isWritable: true }, // platform_config
            { pubkey: feeVaultPda, isSigner: false, isWritable: true }, // fee_vault
            { pubkey: provider.publicKey, isSigner: true, isWritable: true }, // admin (payer)
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ];
          
          const initData = Buffer.from(instruction.instruction_data, 'base64');
          console.log('Init data (hex):', initData.toString('hex'));
          console.log('Init data length:', initData.length);
          
          const initIx = new TransactionInstruction({
            keys,
            programId,
            data: initData,
          });
          
          console.log('Instruction created successfully:', {
            programId: initIx.programId.toBase58(),
            keys: initIx.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
          });
          
          transaction.add(initIx);
        } catch (ixError) {
          console.error('Failed to create initialize_platform instruction:', ixError);
          throw new Error('Failed to create instruction: ' + ixError.message);
        }
        
      } else if (instruction.instruction_type === 'create_market') {
        // create_market - program instruction to initialize a new market
        console.log('Creating create_market program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Decode the instruction data from base64
        const data = Buffer.from(instruction.instruction_data, 'base64');
        console.log('[SolanaTransactionSigner] Decoded instruction data length:', data.length);
        console.log('[SolanaTransactionSigner] First 8 bytes (discriminator):', data.slice(0, 8).toString('hex'));
        
        // Build keys from accounts object if provided
        const keys = [];
        if (instruction.accounts) {
          const accounts = instruction.accounts;
          keys.push({ pubkey: new PublicKey(accounts.market), isSigner: false, isWritable: true });
          keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true }); // payer
          keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
          if (accounts.voteTally) {
            keys.push({ pubkey: new PublicKey(accounts.voteTally), isSigner: false, isWritable: true });
          }
          if (accounts.platformConfig) {
            keys.push({ pubkey: new PublicKey(accounts.platformConfig), isSigner: false, isWritable: true });
          }
        } else {
          // Fallback for legacy format
          keys.push({ pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true });
          keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true });
          keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
        }
        
        console.log('[SolanaTransactionSigner] create_market keys:', keys.map(k => k.pubkey.toBase58()));
        
        const createMarketIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(createMarketIx);
        
      } else if (instruction.instruction_type === 'claim_winnings') {
        // Claim winnings - program instruction to transfer SOL from pool to user
        console.log('Creating claim_winnings program instruction:', instruction);
        
        const programId = new PublicKey('ElevenXProgramID1111111111111111111111111');
        const keys = instruction.keys?.map(k => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })) || [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.positionPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.feeVaultPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.bettorPubkey), isSigner: false, isWritable: true },
        ];
        
        // Create instruction data for claim_winnings (discriminator only - no params needed)
        // claim_winnings is instruction #10 in the program
        const data = Buffer.alloc(1);
        data.writeUInt8(10, 0); // claim_winnings discriminator
        
        const claimIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(claimIx);
        
      } else if (instruction.instruction_type === 'provide_liquidity') {
        // provide_liquidity — call the actual program instruction
        console.log('Creating provide_liquidity program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId || 'ElevenXProgramID1111111111111111111111111');
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true },
          { pubkey: provider.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        // Anchor 8-byte discriminator for provide_liquidity (instruction index 4)
        // Plus params: outcome (u8) + amount (u64)
        const data = Buffer.alloc(17);
        data.writeUInt32LE(4, 0); // instruction index
        data.writeUInt32LE(0, 4); // padding
        data.writeUInt8(instruction.outcome, 8); // outcome parameter
        data.writeBigUInt64LE(BigInt(instruction.amountLamports), 9); // amount parameter
        
        const provideIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(provideIx);
        
      } else if (instruction.instruction_type === 'place_bet') {
        // place_bet — transfer SOL from user to market PDA (escrow)
        const fromPubkey = provider.publicKey;
        const toPubkey = new PublicKey(instruction.marketPda || instruction.betPoolPda);

        console.log('Transfer to market escrow:', {
          from: fromPubkey.toString(),
          to: toPubkey.toString(),
          lamports: instruction.amountLamports,
          type: instruction.instruction_type,
        });

        const transferIx = SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: instruction.amountLamports,
        });
        transaction.add(transferIx);
        
      } else if (instruction.instruction_type === 'match_bet') {
        // match_bet — transfer SOL to match existing offer
        const fromPubkey = provider.publicKey;
        const toPubkey = new PublicKey(instruction.betPoolPda);

        console.log('Match bet - transfer to pool:', {
          from: fromPubkey.toString(),
          to: toPubkey.toString(),
          lamports: instruction.amountLamports,
        });

        const transferIx = SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: instruction.amountLamports,
        });
        transaction.add(transferIx);
      } else if (instruction.instruction_type === 'withdraw_liquidity') {
        // withdraw_liquidity — program instruction to withdraw unmatched LP funds
        console.log('Creating withdraw_liquidity program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true },
          { pubkey: provider.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        // Anchor 8-byte discriminator for withdraw_liquidity (instruction index 5)
        // Discriminator = first 8 bytes of SHA256("account:WithdrawLiquidity")
        // For simplicity, use Anchor's standard format: [0, 0, 0, 0, 0, 0, 0, 5]
        const data = Buffer.alloc(8);
        data.writeUInt32LE(5, 0); // instruction index
        data.writeUInt32LE(0, 4); // padding
        
        const withdrawIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(withdrawIx);
      } else if (instruction.instruction_type === 'claim_refund') {
        // claim_refund — program instruction to refund user's stake (uses on-chain 'refund' instruction)
        console.log('Creating claim_refund program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId || 'ElevenXProgramID1111111111111111111111111');
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.positionPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.bettorPubkey), isSigner: false, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        // Anchor 8-byte discriminator for refund (instruction index 10)
        const data = Buffer.alloc(8);
        data.writeUInt32LE(10, 0);
        data.writeUInt32LE(0, 4);
        
        const refundIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(refundIx);
      } else if (instruction.instruction_type === 'withdraw_lp_winnings') {
        // withdraw_lp_winnings — program instruction for LPs to withdraw from settled winning markets
        console.log('Creating withdraw_lp_winnings program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.feeVaultPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpWalletPubkey), isSigner: false, isWritable: true },
        ];
        
        // Create instruction data for withdraw_lp_winnings (discriminator + amount parameter)
        // withdraw_lp_winnings is instruction #6 in the program (takes amount as u64 parameter)
        const data = Buffer.alloc(9);
        data.writeUInt8(6, 0); // withdraw_lp_winnings discriminator
        data.writeBigUInt64LE(BigInt(instruction.withdrawAmountLamports || 0), 1);
        
        const withdrawIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(withdrawIx);
      }

      // Get recent blockhash for transaction
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = provider.publicKey;

      console.log('[SolanaTransactionSigner] Transaction built, ready to send');
      console.log('[SolanaTransactionSigner] Instructions count:', transaction.instructions.length);
      
      console.log('[SolanaTransactionSigner] Requesting signature from Phantom...');
      console.log('[SolanaTransactionSigner] Transaction details:', {
        feePayer: transaction.feePayer?.toBase58(),
        recentBlockhash: transaction.recentBlockhash,
        instructions: transaction.instructions.map((ix, i) => ({
          index: i,
          programId: ix.programId.toBase58(),
          keys: ix.keys.map(k => `${k.pubkey.toBase58()} (${k.isSigner ? 'signer' : 'non-signer'}, ${k.isWritable ? 'writable' : 'readonly'})`),
          dataLength: ix.data.length,
        })),
      });
      
      // Request signature with error handling for popup blockers
      let sig;
      try {
        // Try with preflight first to catch errors
        const result = await provider.signAndSendTransaction(transaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        sig = result.signature;
        console.log('Transaction signed, signature:', sig);
      } catch (signError) {
        console.error('[SolanaTransactionSigner] Sign error details:', {
          name: signError.name,
          message: signError.message,
          stack: signError.stack,
          errorCode: signError.errorCode,
        });
        
        // Try without preflight as fallback
        try {
          console.log('[SolanaTransactionSigner] Retrying without preflight...');
          const result = await provider.signAndSendTransaction(transaction, {
            skipPreflight: true,
          });
          sig = result.signature;
          console.log('Transaction signed (skip preflight), signature:', sig);
        } catch (retryError) {
          console.error('[SolanaTransactionSigner] Retry failed:', retryError);
          throw new Error(signError.message || 'Failed to sign transaction');
        }
      }

      console.log('Waiting for confirmation...');
      let confirmation;
      try {
        confirmation = await connection.confirmTransaction(sig, 'confirmed');
        console.log('Transaction confirmation result:', confirmation);
      } catch (confirmError) {
        console.error('[SolanaTransactionSigner] Confirmation error:', confirmError);
        
        // Extract on-chain error code from various possible locations
        let customCode = null;
        
        if (confirmError.InstructionError) {
          customCode = confirmError.InstructionError[1]?.Custom;
        }
        
        if (!customCode && confirmError.value?.InstructionError) {
          customCode = confirmError.value.InstructionError[1]?.Custom;
        }
        
        if (!customCode && confirmError.err?.InstructionError) {
          customCode = confirmError.err.InstructionError[1]?.Custom;
        }
        
        if (!customCode && confirmError.message) {
          const match = confirmError.message.match(/Custom["\s:]*(\d+)/);
          if (match) {
            customCode = parseInt(match[1]);
          }
        }

        if (customCode !== null) {
          const errorMessages = {
            0: 'Betting window has closed',
            1: 'Market already settled',
            2: 'Market voided',
            3: 'Stake must be > 0',
            4: 'Invalid outcome',
            5: 'Too early to settle',
            6: 'Market paused',
            7: 'Fee exceeds 5%',
            8: 'Invalid timeline',
            9: 'Nothing to claim',
            10: 'Nothing to refund',
            11: 'Market not voided',
            12: 'Oracle already voted',
            13: 'Insufficient consensus',
            14: 'Invalid outcome count',
            15: 'Market already initialized',
            16: 'Arithmetic overflow',
            17: 'Unauthorized',
            3007: 'Platform not initialized',
          };
          const errorMsg = errorMessages[customCode] || `Program error ${customCode}`;
          throw new Error(`On-chain error ${customCode}: ${errorMsg}`);
        }
        
        throw new Error('Confirmation failed: ' + (confirmError.message || 'Unknown'));
      }

      // Check for on-chain errors BEFORE setting signature
      if (confirmation.value.err) {
        console.error('Transaction failed on-chain:', confirmation.value.err);
        const onChainErr = confirmation.value.err;
        if (onChainErr.InstructionError && onChainErr.InstructionError[1]?.Custom !== undefined) {
          const customCode = onChainErr.InstructionError[1].Custom;
          const errorMessages = {
            0: 'Betting window closed',
            1: 'Market settled',
            15: 'Market already initialized',
            3007: 'Platform not initialized',
          };
          const errorMsg = errorMessages[customCode] || `Error ${customCode}`;
          throw new Error(`Transaction failed: ${errorMsg}`);
        }
        throw new Error('Transaction failed on-chain');
      }

      // Only set signature after successful confirmation
      setSignature(sig);
      console.log('Transaction confirmed on-chain!');
      onSuccess({ signature: sig, status: 'confirmed', userBetId, offerId, isPlatformInit: isPlatformInit || false });
    } catch (err) {
      console.error('[SolanaTransactionSigner] Transaction error:', err);
      console.error('[SolanaTransactionSigner] Error stack:', err.stack);
      const errorMsg = err.message || 'Transaction failed';
      setError(errorMsg);
      onError?.(err);
    } finally {
      setIsSigning(false);
    }
  };

  if (signature) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center"
      >
        <CheckCircle className="w-8 h-8 text-accent mx-auto mb-2" />
        <p className="font-heading font-bold text-sm text-accent">Transaction Confirmed!</p>
        <p className="text-xs text-muted-foreground mt-1">
          Signature: {signature.slice(0, 8)}...{signature.slice(-8)}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-primary" />
        <div>
          <p className="font-heading font-bold text-sm">Sign Solana Transaction</p>
          <p className="text-xs text-muted-foreground">Amount: ◎{amount}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-xs">
          <XCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <Button
        onClick={handleSignTransaction}
        disabled={isSigning}
        className="w-full h-10 font-heading font-bold rounded-xl text-sm"
        style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}
      >
        {isSigning ? (
          <>
            <Loader className="w-4 h-4 mr-2 animate-spin" />
            Signing...
          </>
        ) : !isConnected ? (
          <>
            <Wallet className="w-4 h-4 mr-2" />
            Connect Phantom
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4 mr-2" />
            Sign & Confirm
          </>
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        This transaction will be recorded on the Solana blockchain
      </p>
    </div>
  );
}