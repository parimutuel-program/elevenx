import React, { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { Wallet, Loader, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

// Compute Anchor 8-byte discriminator: SHA256("global:<name>").slice(0, 8)
async function anchorDiscriminator(name) {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}

export default function SolanaTransactionSigner({ instruction, amount, userBetId, offerId, betId, isOffer, isPlatformInit, batchBetIds, futures_market_id, onSuccess, onError }) {
  // userBetId, offerId, betId, isOffer, isPlatformInit, batchBetIds, futures_market_id are optional - used for tracking DB records or flow control after transaction
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

      // CRITICAL: Force Phantom to use the correct wallet
      const connectedWallet = provider.publicKey?.toBase58?.();
      const storedWallet = localStorage.getItem('elevenx_wallet_session');
      const expectedWallet = storedWallet ? JSON.parse(storedWallet).address : null;
      
      console.log('=== SOLANA TRANSACTION SIGNING DEBUG ===');
      console.log('Component isConnected:', isConnected);
      console.log('Phantom connected:', provider.isConnected);
      console.log('Phantom wallet:', connectedWallet);
      console.log('Expected wallet (from localStorage):', expectedWallet);
      console.log('Wallets match:', connectedWallet === expectedWallet);
      
      // If wallets don't match, show error
      if (expectedWallet && connectedWallet !== expectedWallet) {
        const errorMsg = `❌ Wallet mismatch!\n\nPhantom is using:\n${connectedWallet?.slice(0, 8)}...${connectedWallet?.slice(-8)}\n\nBut your session expects:\n${expectedWallet.slice(0, 8)}...${expectedWallet.slice(-8)}\n\nPlease:\n1. Disconnect Phantom\n2. Make sure you have the correct wallet selected in Phantom\n3. Reconnect`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Double-check: Query Phantom for ALL connected accounts
      if (provider.publicKey) {
        console.log('✓ Wallet check passed:', connectedWallet === expectedWallet);
      }
      console.log('========================================');

      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const transaction = new Transaction();
      
      // Check instruction type and build appropriate transaction
      if (instruction.instruction_type === 'initialize_platform') {
        // Initialize platform config
        console.log('Creating initialize_platform instruction:', instruction);
        console.log('Full instruction object:', JSON.stringify(instruction, null, 2));
        console.log('Platform config PDA:', instruction.accounts?.platformConfig);
        console.log('Fee vault PDA:', instruction.accounts?.feeVault);
        console.log('Program ID:', instruction.programId);
        console.log('Admin signer:', provider.publicKey.toBase58());
        
        try {
          // Validate all required fields exist
          if (!instruction.programId) throw new Error('Missing programId');
          if (!instruction.accounts?.platformConfig) throw new Error('Missing accounts.platformConfig');
          if (!instruction.accounts?.feeVault) throw new Error('Missing accounts.feeVault');
          
          const programId = new PublicKey(instruction.programId);
          const platformPda = new PublicKey(instruction.accounts.platformConfig);
          const feeVaultPda = new PublicKey(instruction.accounts.feeVault);
          
          console.log('PublicKeys created:', {
            programId: programId.toBase58(),
            platformPda: platformPda.toBase58(),
            feeVaultPda: feeVaultPda.toBase58(),
          });
          
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
          console.error('Instruction object was:', instruction);
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
        console.log('[SolanaTransactionSigner] Full instruction data (hex):', data.toString('hex'));
        
        // Validate instruction data size (should be 8 + 171 = 179 bytes)
        if (data.length !== 179) {
          console.error('[SolanaTransactionSigner] WARNING: Unexpected instruction data length:', data.length, '(expected 179)');
        }
        
        // Build keys in the EXACT order required by the Rust CreateMarket struct:
        // market, vote_tally, platform_config, admin (payer/signer), system_program
        const keys = [];
        if (instruction.accounts) {
          const accounts = instruction.accounts;
          
          // Validate all required accounts are present
          if (!accounts.market) {
            throw new Error('Missing market account in instruction');
          }
          if (!accounts.voteTally) {
            throw new Error('Missing voteTally account in instruction');
          }
          if (!accounts.platformConfig) {
            throw new Error('Missing platformConfig account in instruction');
          }
          if (!accounts.admin) {
            throw new Error('Missing admin account in instruction');
          }
          
          keys.push({ pubkey: new PublicKey(accounts.market), isSigner: false, isWritable: true });
          keys.push({ pubkey: new PublicKey(accounts.voteTally), isSigner: false, isWritable: true });
          keys.push({ pubkey: new PublicKey(accounts.platformConfig), isSigner: false, isWritable: true });
          // Admin/payer must be the signer wallet
          keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true });
          keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
        } else {
          throw new Error('Missing accounts in create_market instruction');
        }
        
        console.log('[SolanaTransactionSigner] create_market keys:', keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })));
        
        const createMarketIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        console.log('[SolanaTransactionSigner] Created instruction:', {
          programId: createMarketIx.programId.toBase58(),
          dataLength: createMarketIx.data.length,
          keysCount: createMarketIx.keys.length,
        });
        
        transaction.add(createMarketIx);
        
      } else if (instruction.instruction_type === 'settle_market') {
        // settle_market - program instruction to announce winner and settle market (emergency_settle)
        console.log('Creating settle_market program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Decode the instruction data from base64
        const data = Buffer.from(instruction.instruction_data, 'base64');
        console.log('[SolanaTransactionSigner] settle_market data length:', data.length);
        console.log('[SolanaTransactionSigner] settle_market data (hex):', data.toString('hex'));
        
        // Build keys from instruction, replacing SIGNER_WALLET placeholder with actual wallet
        const keys = instruction.keys?.map(k => {
          const pubkeyStr = k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey;
          console.log('[SolanaTransactionSigner] Processing key:', {
            original: k.pubkey,
            replaced: pubkeyStr,
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          });
          return {
            pubkey: new PublicKey(pubkeyStr),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          };
        });
        
        console.log('[SolanaTransactionSigner] settle_market final keys:', keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })));
        
        const settleMarketIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(settleMarketIx);
        
      } else if (instruction.instruction_type === 'claim_winnings') {
        // Claim winnings - program instruction to transfer SOL from pool to user
        console.log('Creating claim_winnings program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Use keys array from instruction (includes all 5 required accounts)
        const keys = instruction.keys?.map(k => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }));
        
        if (!keys || keys.length !== 5) {
          throw new Error('claim_winnings requires exactly 5 accounts');
        }
        
        console.log('[SolanaTransactionSigner] claim_winnings keys:', keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })));
        
        // Create 8-byte Anchor discriminator for claim_winnings
        const data = await anchorDiscriminator('claim_winnings');
        
        const claimIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(claimIx);
        
      } else if (instruction.instruction_type === 'provide_liquidity') {
        // provide_liquidity — call the actual program instruction
        console.log('Creating provide_liquidity program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Build keys in the EXACT order required by the Rust ProvideLiquidity struct:
        // market, lp_offer, lp (signer), system_program
        const keys = [];
        if (instruction.accounts) {
          const accounts = instruction.accounts;
          keys.push({ pubkey: new PublicKey(accounts.market), isSigner: false, isWritable: true });
          keys.push({ pubkey: new PublicKey(accounts.lpOffer), isSigner: false, isWritable: true });
          keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true }); // lp signer
          keys.push({ pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }); // system_program
        } else {
          // Fallback for legacy format
          keys.push({ pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true });
          keys.push({ pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true });
          keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true });
          keys.push({ pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false });
        }
        
        // Anchor discriminator (8 bytes) + outcome (u8) + amount (u64 LE) = 17 bytes
        const disc = await anchorDiscriminator('provide_liquidity');
        const data = Buffer.alloc(17);
        disc.copy(data, 0);
        data.writeUInt8(instruction.outcome, 8);
        data.writeBigUInt64LE(BigInt(instruction.amountLamports), 9);
        console.log('[SolanaTransactionSigner] provide_liquidity discriminator:', disc.toString('hex'));
        console.log('[SolanaTransactionSigner] full data:', data.toString('hex'));
        
        const provideIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(provideIx);
        
      } else if (instruction.instruction_type === 'provide_liquidity') {
        // provide_liquidity — LP deposits SOL (parimutuel: bettor IS the LP)
        console.log('Creating provide_liquidity program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Build keys in the EXACT order required by the Rust ProvideLiquidity struct:
        // market, lp_offer, lp (signer), system_program
        const keys = [];
        keys.push({ pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true });
        keys.push({ pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true });
        keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true }); // lp signer
        keys.push({ pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }); // system_program
        
        // Anchor discriminator (8 bytes) + outcome (u8) + amount (u64 LE) = 17 bytes
        const disc = await anchorDiscriminator('provide_liquidity');
        const data = Buffer.alloc(17);
        disc.copy(data, 0);
        data.writeUInt8(instruction.outcome, 8);
        data.writeBigUInt64LE(BigInt(instruction.amountLamports), 9);
        console.log('[SolanaTransactionSigner] provide_liquidity discriminator:', disc.toString('hex'));
        console.log('[SolanaTransactionSigner] full data:', data.toString('hex'));
        
        const provideIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(provideIx);
        
      } else if (instruction.instruction_type === 'place_bet') {
        // place_bet — call the actual program instruction
        console.log('Creating place_bet program instruction:', instruction);
        
        // Validate market PDA is a real Solana address
        try {
          new PublicKey(instruction.marketPda);
        } catch (err) {
          console.error('[SolanaTransactionSigner] Invalid market PDA:', instruction.marketPda);
          throw new Error('Invalid market configuration. Admin must deploy this market on-chain first.');
        }
        
        const programId = new PublicKey(instruction.programId);
        
        // Build keys - handle parimutuel mode (no LP offer PDA)
        const keys = [];
        keys.push({ pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true });
        
        // CRITICAL: Parimutuel mode MUST still include lp_offer account - use bettor's own address as placeholder
        // The Solana program expects 6 accounts: market, lp_offer, bettor_position, bettor, system_program
        if (instruction.lpOfferPda) {
          // Fixed-odds mode: use real LP offer PDA
          keys.push({ pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true });
        } else {
          // Parimutuel mode: use bettor's position PDA as lp_offer placeholder
          // This tells the program to create a self-backed position (betting into the pool)
          keys.push({ pubkey: new PublicKey(instruction.bettorPositionPda), isSigner: false, isWritable: true });
        }
        
        keys.push({ pubkey: new PublicKey(instruction.bettorPositionPda), isSigner: false, isWritable: true });
        keys.push({ pubkey: provider.publicKey, isSigner: true, isWritable: true }); // bettor signer
        keys.push({ pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }); // system_program
        
        // Anchor discriminator (8 bytes) + outcome (u8) + amount (u64 LE) = 17 bytes
        const disc = await anchorDiscriminator('place_bet');
        const data = Buffer.alloc(17);
        disc.copy(data, 0);
        data.writeUInt8(instruction.outcome, 8);
        data.writeBigUInt64LE(BigInt(instruction.amountLamports), 9);
        console.log('[SolanaTransactionSigner] place_bet discriminator:', disc.toString('hex'));
        console.log('[SolanaTransactionSigner] full data:', data.toString('hex'));
        
        const placeBetIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(placeBetIx);
        
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
        
        const data = await anchorDiscriminator('withdraw_liquidity');
        
        const withdrawIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(withdrawIx);
      } else if (instruction.instruction_type === 'claim_refund') {
        // claim_refund — program instruction to refund user's stake (uses on-chain 'refund' instruction)
        console.log('Creating claim_refund program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.positionPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.bettorPubkey), isSigner: false, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        const data = await anchorDiscriminator('refund');
        
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
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        // Anchor discriminator (8 bytes) + amount (u64 LE) + outcome (u8) = 17 bytes
        const wlwDisc = await anchorDiscriminator('withdraw_lp_winnings');
        const data = Buffer.alloc(17);
        wlwDisc.copy(data, 0);
        data.writeBigUInt64LE(BigInt(instruction.withdrawAmountLamports || 0), 8);
        data.writeUInt8(instruction.outcome || 0, 16); // outcome: 0=a, 1=b, 2=draw
        
        const withdrawIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(withdrawIx);
        
      } else if (instruction.instruction_type === 'void_market') {
        console.log('Creating void_market program instruction:', instruction);
        const programId = new PublicKey(instruction.programId);
        const keys = instruction.keys.map(k => ({
          pubkey: new PublicKey(k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }));
        const data = Buffer.from(instruction.instruction_data, 'base64');
        transaction.add(new TransactionInstruction({ keys, programId, data }));

      } else if (instruction.instruction_type === 'update_market_timestamps') {
        // update_market_timestamps — admin recovery tool to fix corrupted timestamps
        console.log('Creating update_market_timestamps program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Use keys array if provided (new format), otherwise fall back to accounts
        const keys = instruction.keys?.map(k => ({
          pubkey: new PublicKey(k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })) || [
          { pubkey: new PublicKey(instruction.accounts.market), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.accounts.platformConfig), isSigner: false, isWritable: false },
          { pubkey: provider.publicKey, isSigner: true, isWritable: false }, // admin signer (not writable)
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        ];
        
        const data = Buffer.from(instruction.instruction_data, 'base64');
        
        const updateIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(updateIx);
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
            101: 'Invalid instruction data or discriminator',
            3002: 'Account not found - market may not be deployed on-chain yet',
            3007: 'Platform not initialized',
            3012: 'Unauthorized - your wallet is not registered as admin in platform config',
            6005: 'Constraint violation - account constraints not satisfied',
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
            101: 'Invalid instruction data or discriminator',
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
      console.log('[SolanaTransactionSigner] Calling onSuccess with signature:', sig);
      
      // Pass commit_data if available (for futures bets)
      const commitPayload = { 
        signature: sig, 
        status: 'confirmed', 
        userBetId, 
        offerId, 
        betId, 
        isPlatformInit: isPlatformInit || false,
        futures_market_id,
      };
      
      // Add commit_data for futures bets if available
      if (window.pendingFuturesCommit) {
        commitPayload.commit_data = window.pendingFuturesCommit.commit_data;
        console.log('[SolanaTransactionSigner] Added futures commit_data from window');
      }
      
      console.log('[SolanaTransactionSigner] Final commitPayload:', { ...commitPayload, commit_data: commitPayload.commit_data ? 'exists' : undefined });
      onSuccess(commitPayload);
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
    // Show success message for all transaction types
    const solanaScanUrl = `https://solscan.io/tx/${signature}?cluster=devnet`;
    
    // Determine transaction type message and payout info
    let txMessage = 'Transaction confirmed on Solana';
    let payoutInfo = null;
    let goodLuckMessage = null;
    if (instruction?.instruction_type === 'place_bet') {
      txMessage = '✓ Bet placed successfully!';
      goodLuckMessage = 'Good luck! 🍀';
      if (instruction.amountLamports) {
        const solAmount = (instruction.amountLamports / 1e9).toFixed(4);
        payoutInfo = `◎${solAmount} SOL staked`;
      }
    } else if (instruction?.instruction_type === 'provide_liquidity') {
      txMessage = '✓ Liquidity provided (parimutuel pool)!';
      if (instruction.amountLamports) {
        const solAmount = (instruction.amountLamports / 1e9).toFixed(4);
        payoutInfo = `◎${solAmount} SOL deposited`;
      }
      goodLuckMessage = 'Good luck! 🍀';
    } else if (instruction?.instruction_type === 'claim_winnings') {
      txMessage = '✓ Winnings claimed!';
      if (instruction.amountLamports) {
        const solAmount = (instruction.amountLamports / 1e9).toFixed(4);
        payoutInfo = `◎${solAmount} SOL claimed`;
      }
    } else if (instruction?.instruction_type === 'withdraw_liquidity') {
      txMessage = '✓ Liquidity withdrawn!';
    } else if (instruction?.instruction_type === 'claim_refund') {
      txMessage = '✓ Refund claimed!';
    } else if (instruction?.instruction_type === 'withdraw_lp_winnings') {
      txMessage = '✓ LP winnings withdrawn!';
    } else if (instruction?.instruction_type === 'create_market') {
      txMessage = '✓ Market created on-chain!';
    } else if (instruction?.instruction_type === 'void_market') {
      txMessage = '✓ Market voided! Click ⚡ Test Mode again to recreate.';
    } else if (instruction?.instruction_type === 'update_market_timestamps') {
      txMessage = '✓ Market timestamps updated!';
    }
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center"
      >
        <CheckCircle className="w-8 h-8 text-accent mx-auto mb-2" />
        <p className="font-heading font-bold text-sm text-accent">{txMessage}</p>
        {payoutInfo && (
          <p className="font-heading font-bold text-lg text-accent mt-1">{payoutInfo}</p>
        )}
        {goodLuckMessage && (
          <p className="font-heading font-bold text-sm text-accent mt-2">{goodLuckMessage}</p>
        )}
        <div className="mt-3 pt-3 border-t border-accent/20">
          <p className="text-xs text-muted-foreground mb-1">Transaction on Solana</p>
          <a 
            href={solanaScanUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center gap-1 text-primary text-xs font-bold hover:underline"
          >
            View on Solscan →
            <span className="font-mono text-[10px] text-muted-foreground">{signature.slice(0, 8)}...{signature.slice(-8)}</span>
          </a>
        </div>
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