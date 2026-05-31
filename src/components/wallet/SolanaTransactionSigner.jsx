import React, { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Wallet, Loader, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import { Connection } from '@solana/web3.js';

export default function SolanaTransactionSigner({ instruction, amount, onSuccess, onError }) {
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

      // Connect to wallet
      const resp = await provider.connect();
      const publicKey = resp.publicKey;

      // Create transaction from instruction
      const { Transaction, PublicKey, SystemProgram } = await import('@solana/web3.js');
      
      const transaction = new Transaction();
      
      // Add transfer instruction for SOL (this deducts funds from wallet)
      if (instruction.amountLamports) {
        const transferIx = SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(instruction.betPoolPda || instruction.userPositionPda),
          lamports: instruction.amountLamports,
        });
        transaction.add(transferIx);
      }
      
      // Add program instruction if provided
      if (instruction.programId && instruction.data) {
        const ix = {
          programId: new PublicKey(instruction.programId),
          keys: instruction.keys.map(k => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(instruction.data, 'hex'),
        };
        transaction.add(ix);
      }

      // Request signature
      const { signature: sig } = await provider.signAndSendTransaction(transaction);
      setSignature(sig);

      // Wait for confirmation
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      await connection.confirmTransaction(sig, 'confirmed');

      onSuccess({ signature: sig, status: 'confirmed' });
    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err.message);
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