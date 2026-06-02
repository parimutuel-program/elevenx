import React, { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Wallet, Loader, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

export default function SolanaTransactionSigner({ instruction, amount, userBetId, offerId, isOffer, onSuccess, onError }) {
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
      if (instruction.instruction_type === 'claim_winnings') {
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
        
        // Create instruction data for claim_winnings (discriminator + net payout)
        const data = Buffer.alloc(9);
        data.writeUInt8(6, 0); // claim_winnings discriminator
        data.writeBigUInt64LE(BigInt(instruction.netPayoutLamports || 0), 1);
        
        const claimIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(claimIx);
        
      } else if (instruction.instruction_type === 'place_bet' || instruction.instruction_type === 'provide_liquidity') {
        // place_bet / provide_liquidity — transfer SOL from user to market PDA (escrow)
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
        
        // Use the program ID from instruction (passed from backend)
        if (!instruction.programId) {
          throw new Error('Missing programId in instruction');
        }
        const programId = new PublicKey(instruction.programId);
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true },
          { pubkey: provider.publicKey, isSigner: true, isWritable: true }, // LP wallet receiving funds
        ];
        
        // Create instruction data for withdraw_liquidity (discriminator 7 + amount + outcome)
        const data = Buffer.alloc(17);
        data.writeUInt8(7, 0); // withdraw_liquidity discriminator
        data.writeBigUInt64LE(BigInt(instruction.amountLamports || 0), 1);
        data.writeUInt8(instruction.outcome || 0, 9); // outcome index
        
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
        ];
        
        // Create instruction data for refund (discriminator 5, no amount needed - reads from position)
        const data = Buffer.alloc(1);
        data.writeUInt8(5, 0); // refund discriminator
        
        const refundIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(refundIx);
      }

      // Get recent blockhash for transaction
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = provider.publicKey;

      console.log('[SolanaTransactionSigner] Transaction built, ready to send');
      console.log('[SolanaTransactionSigner] Instructions count:', transaction.instructions.length);
      
      console.log('[SolanaTransactionSigner] Requesting signature from Phantom...');
      
      // Request signature with error handling for popup blockers
      let sig;
      try {
        const result = await provider.signAndSendTransaction(transaction, {
          skipPreflight: true, // Skip preflight for faster signing
          preflightCommitment: 'confirmed'
        });
        sig = result.signature;
        console.log('Transaction signed, signature:', sig);
      } catch (signError) {
        console.error('[SolanaTransactionSigner] Sign error:', signError);
        throw new Error(signError.message || 'Failed to sign transaction');
      }
      
      setSignature(sig);

      console.log('Waiting for confirmation...');
      let confirmation;
      try {
        confirmation = await connection.confirmTransaction(sig, 'confirmed');
        console.log('Transaction confirmation result:', confirmation);
      } catch (confirmError) {
        console.error('[SolanaTransactionSigner] Confirmation error:', confirmError);
        // Extract on-chain error from the error object
        let onChainErr = confirmError.value?.err || confirmError.err;
        
        // If error is nested differently, try to find it
        if (!onChainErr && confirmError.message && confirmError.message.includes('Custom')) {
          const match = confirmError.message.match(/Custom["\s:]*(\d+)/);
          if (match) {
            throw new Error(`On-chain program error code ${match[1]}. Check your Solana program.`);
          }
        }
        
        if (onChainErr && onChainErr.InstructionError && onChainErr.InstructionError[1]?.Custom !== undefined) {
          const customCode = onChainErr.InstructionError[1].Custom;
          throw new Error(`On-chain program error code ${customCode}. Check your Solana program.`);
        }
        throw new Error('Transaction confirmation failed: ' + (confirmError.message || 'Unknown error'));
      }

      // Check for on-chain errors
      if (confirmation.value.err) {
        console.error('Transaction failed on-chain:', confirmation.value.err);
        const onChainErr = confirmation.value.err;
        if (onChainErr.InstructionError && onChainErr.InstructionError[1]?.Custom !== undefined) {
          const customCode = onChainErr.InstructionError[1].Custom;
          throw new Error(`On-chain program error code ${customCode}. Check your Solana program.`);
        }
        throw new Error('On-chain error: ' + JSON.stringify(onChainErr));
      }

      console.log('Transaction confirmed on-chain!');
      onSuccess({ signature: sig, status: 'confirmed', userBetId, offerId });
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