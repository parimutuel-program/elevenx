import React, { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Wallet, Loader, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import { Connection } from '@solana/web3.js';

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
      // Get Phantom wallet
      const provider = window.solana;
      if (!provider) {
        throw new Error('Phantom wallet not found. Please install Phantom extension.');
      }

      // Ensure wallet is connected
      if (!provider.isConnected) {
        await provider.connect();
      }

      // Create transaction from instruction
      const { Transaction, PublicKey, SystemProgram, TransactionInstruction } = await import('@solana/web3.js');
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      
      const transaction = new Transaction();
      
      // Check if this is a claim_winnings instruction or a bet/offer instruction
      if (instruction.instruction_type === 'claim_winnings') {
        // Claim winnings - program will transfer SOL from pool to user
        console.log('Creating claim_winnings program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = instruction.keys.map(k => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }));
        
        const data = Buffer.from(instruction.data, 'base64');
        
        const claimIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(claimIx);
      } else if (instruction.amountLamports) {
        // place_bet / provide_liquidity — transfer SOL from user to market PDA (escrow)
        const fromPubkey = provider.publicKey;
        // marketPda is the escrow for both place_bet and provide_liquidity
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
      }

      // Get recent blockhash for transaction
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = provider.publicKey;

      console.log('Sending transaction to Phantom for signature...');
      
      // Request signature - this should trigger Phantom popup
      const { signature: sig } = await provider.signAndSendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      console.log('Transaction signed, signature:', sig);
      setSignature(sig);

      // Wait for confirmation
      console.log('Waiting for confirmation...');
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Transaction confirmed!');

      onSuccess({ signature: sig, status: 'confirmed' });
    } catch (err) {
      console.error('Transaction failed:', err);
      console.error('Error stack:', err.stack);
      setError(err.message || 'Transaction failed');
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