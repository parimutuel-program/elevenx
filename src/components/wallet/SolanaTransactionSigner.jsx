import React, { useState, useEffect } from 'react';
import { Wallet, Loader, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { base44 } from '@/api/base44Client';

// Compute Anchor discriminator: SHA256("global:<name>").slice(0, 8)
// Anchor uses "global:<instruction_name>" format by default
async function anchorDiscriminator(name) {
  const msg = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  return Buffer.from(new Uint8Array(hash).slice(0, 8));
}

export default function SolanaTransactionSigner({ instruction, amount, userBetId, offerId, betId, isOffer, isPlatformInit, batchBetIds, futures_market_id, onSuccess, onError }) {
  // userBetId, offerId, betId, isOffer, isPlatformInit, batchBetIds, futures_market_id are optional - used for tracking DB records or flow control after transaction
  const [isSigning, setIsSigning] = useState(false);
  const [signStep, setSignStep] = useState(''); // 'connecting' | 'signing' | 'confirming'
  const [signature, setSignature] = useState(null);
  const [error, setError] = useState(null);
  
  // Load Solana config from backend on mount (mainnet RPC)
  useEffect(() => {
    if (!window.SOLANA_RPC_URL) {
      base44.functions.invoke('solanaConfig', {}).then(res => {
        if (res.data.rpcUrl) {
          window.SOLANA_RPC_URL = res.data.rpcUrl;
          window.SOLANA_PROGRAM_ID = res.data.programId;
          console.log('[SolanaTransactionSigner] Loaded Solana config:', {
            rpcUrl: res.data.rpcUrl,
            programId: res.data.programId,
            network: res.data.network,
          });
        }
      }).catch(err => console.error('[SolanaTransactionSigner] Failed to load Solana config:', err));
    }
  }, []);

  const handleSignTransaction = async () => {
    setIsSigning(true);
    setSignStep('connecting');
    setError(null);

    try {
      // Direct Phantom connection - don't rely on WalletContext
      const provider = window.solana;
      
      console.log('[SolanaTransactionSigner] Phantom detection:', {
        hasWindowSolana: !!window.solana,
        isPhantom: window.solana?.isPhantom,
        providerType: typeof window.solana,
      });
      
      if (!provider) {
        throw new Error('Phantom wallet not found. Please install Phantom extension.');
      }

      if (!provider.isConnected) {
        console.log('[SolanaTransactionSigner] Connecting to Phantom...');
        setSignStep('connecting');
        await provider.connect();
        console.log('[SolanaTransactionSigner] Connected successfully');
      }

      // CRITICAL: Force Phantom to use the correct wallet
      const connectedWallet = provider.publicKey?.toBase58?.();
      const storedWallet = localStorage.getItem('elevenx_wallet_session');
      const expectedWallet = storedWallet ? JSON.parse(storedWallet).address : null;
      
      console.log('=== SOLANA TRANSACTION SIGNING DEBUG ===');
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

      // CRITICAL: Read RPC URL from instruction or use environment-based default
      // Backend functions should provide rpcUrl in instruction if non-standard
      // Default to mainnet - devnet is only for testing
      const rpcUrl = instruction.rpcUrl || window.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
      console.log('[SolanaTransactionSigner] Using RPC URL:', rpcUrl);
      console.log('[SolanaTransactionSigner] Network config:', {
        windowSolanaRpcUrl: window.SOLANA_RPC_URL,
        instructionRpcUrl: instruction.rpcUrl,
        fallbackUsed: !instruction.rpcUrl && !window.SOLANA_RPC_URL,
      });
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
            { pubkey: provider.publicKey, isSigner: true, isWritable: true }, // admin (payer/signer)
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          ];
          
          console.log('Instruction accounts (4 total):', keys.map(k => ({
            pubkey: k.pubkey.toBase58(),
            isWritable: k.isWritable,
            isSigner: k.isSigner,
          })));
          
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
        
        console.log('[SolanaTransactionSigner] create_market instruction data length:', data.length, '(expected 180)');
        
        // Build keys — prefer keys array (always has SIGNER_WALLET placeholder), fall back to accounts object
        const keys = [];
        if (instruction.keys && instruction.keys.length === 5) {
          instruction.keys.forEach((k) => {
            const pubkeyStr = k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey;
            if (!pubkeyStr) throw new Error(`create_market: undefined pubkey in keys array at index ${instruction.keys.indexOf(k)}`);
            keys.push({ pubkey: new PublicKey(pubkeyStr), isSigner: k.isSigner, isWritable: k.isWritable });
          });
        } else if (instruction.accounts) {
          const a = instruction.accounts;
          const entries = [
            ['market', a.market, false, true],
            ['voteTally', a.voteTally, false, true],
            ['platformConfig', a.platformConfig, false, true],
            ['admin (signer)', provider.publicKey?.toBase58(), true, true],
            ['systemProgram', a.systemProgram || '11111111111111111111111111111111', false, false],
          ];
          for (const [name, pubkeyStr, isSigner, isWritable] of entries) {
            if (!pubkeyStr) throw new Error(`create_market: account "${name}" is undefined`);
            keys.push({ pubkey: new PublicKey(pubkeyStr), isSigner, isWritable });
          }
        } else {
          throw new Error('create_market instruction missing both keys and accounts');
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
        
      } else if (instruction.instruction_type === 'settle_market' || instruction.instruction_type === 'settle_market_force' || instruction.instruction_type === 'test_announce_winner') {
        // settle_market / settle_market_force / test_announce_winner - program instruction to announce winner and settle market
        console.log('=== SETTLE_MARKET INSTRUCTION ===');
        console.log('instruction_type:', instruction.instruction_type);
        console.log('Full instruction:', instruction);
        console.log('instruction.keys:', instruction.keys);
        console.log('instruction.keys?.length:', instruction.keys?.length);
        
        const programId = new PublicKey(instruction.programId);
        
        // Decode the instruction data from base64
        const data = Buffer.from(instruction.instruction_data, 'base64');
        console.log('[SolanaTransactionSigner] settle_market data length:', data.length);
        console.log('[SolanaTransactionSigner] settle_market data (hex):', data.toString('hex'));
        
        // Build keys from instruction, replacing SIGNER_WALLET placeholder with actual wallet
        if (!instruction.keys || instruction.keys.length === 0) {
          console.error('[SolanaTransactionSigner] NO KEYS PROVIDED!');
          throw new Error('settle_market instruction missing keys array');
        }
        const keys = instruction.keys.map(k => {
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
        
        // Use instruction_data from backend (8-byte discriminator + 1-byte outcome)
        const data = Buffer.from(instruction.instruction_data, 'base64');
        console.log('[SolanaTransactionSigner] claim_winnings instruction_data (hex):', data.toString('hex'));
        
        const claimIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(claimIx);
        
      } else if (instruction.instruction_type === 'provide_liquidity') {
        // provide_liquidity — use instruction_data + keys directly from backend
        console.log('Creating provide_liquidity program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        
        // Guard: ensure keys array exists and has 4 accounts
        if (!instruction.keys || !Array.isArray(instruction.keys) || instruction.keys.length === 0) {
          console.error('[SolanaTransactionSigner] provide_liquidity: keys array is missing or empty:', instruction.keys);
          throw new Error('Invalid instruction: keys array is undefined or empty. Backend must provide 4 accounts (market, lpOffer, lp, systemProgram).');
        }
        
        // Build keys: replace signer wallet placeholder, mark lp (index 2) as signer
        const keys = instruction.keys.map((k, i) => ({
          pubkey: new PublicKey(k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey),
          isSigner: i === 2 ? true : k.isSigner,
          isWritable: k.isWritable,
        }));
        
        // Use instruction_data from backend (has correct hardcoded discriminator)
        const data = Buffer.from(instruction.instruction_data, 'base64');
        console.log('[SolanaTransactionSigner] provide_liquidity data (hex):', data.toString('hex'));
        
        const provideIx = new TransactionInstruction({ keys, programId, data });
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
        console.log('[withdraw_liquidity] Instruction details:', {
          marketPda: instruction.marketPda,
          lpOfferPda: instruction.lpOfferPda,
          hasKeysArray: !!instruction.keys,
          keys: instruction.keys,
        });
        
        const programId = new PublicKey(instruction.programId);
        
        // Use keys array from instruction if provided (preferred), otherwise derive from PDAs
        const keys = instruction.keys?.map(k => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })) || [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true },
          { pubkey: provider.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        console.log('[withdraw_liquidity] Final keys:', keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })));
        
        const data = await anchorDiscriminator('withdraw_liquidity');
        console.log('[withdraw_liquidity] Discriminator:', data.toString('hex'));
        
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
        
        // Use instruction_data from backend (8-byte discriminator + 1-byte outcome)
        const data = instruction.instruction_data ? Buffer.from(instruction.instruction_data, 'base64') : await anchorDiscriminator('refund');
        console.log('[SolanaTransactionSigner] claim_refund instruction_data (hex):', data.toString('hex'));
        
        const refundIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(refundIx);
      } else if (instruction.instruction_type === 'withdraw_lp_winnings') {
        // withdraw_lp_winnings — program instruction for LPs to withdraw from settled winning markets
        console.log('=== WITHDRAW_LP_WINNINGS INSTRUCTION DEBUG ===');
        console.log('[withdraw_lp_winnings] Creating instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        // WithdrawLpWinnings expects: market, lp_offer, fee_vault, lp_wallet, system_program
        // lp_wallet is NOT a signer in the Rust struct (just UncheckedAccount)
        const keys = [
          { pubkey: new PublicKey(instruction.marketPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpOfferPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.feeVaultPda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(instruction.lpWalletPubkey), isSigner: false, isWritable: true }, // NOT a signer
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
        ];
        
        // Try both discriminator formats to match deployed program
        // Format 1: Anchor default "global:<name>" - anchorDiscriminator() adds "global:" prefix
        const discGlobal = await anchorDiscriminator('withdraw_lp_winnings');
        // Format 2: Raw SHA256 of just the function name (for older Anchor versions)
        const msgSimple = new TextEncoder().encode('withdraw_lp_winnings');
        const hashSimple = await crypto.subtle.digest('SHA-256', msgSimple);
        const discSimple = Buffer.from(new Uint8Array(hashSimple).slice(0, 8));
        
        console.log('[withdraw_lp_winnings] Discriminator formats:', {
          global_format: discGlobal.toString('hex'),
          simple_format: discSimple.toString('hex'),
        });
        
        // Use GLOBAL format (Anchor default) - the program was deployed with Anchor
        const wlwDisc = discGlobal;
        console.log('[withdraw_lp_winnings] Using GLOBAL discriminator:', wlwDisc.toString('hex'));
        
        // Instruction data: 8-byte discriminator + 8-byte amount (u64 LE)
        const withdrawAmount = BigInt(instruction.withdrawAmountLamports || 0);
        console.log('[withdraw_lp_winnings] Withdraw amount:', {
          lamports: instruction.withdrawAmountLamports,
          sol: (instruction.withdrawAmountLamports || 0) / 1e9,
          asBigInt: withdrawAmount.toString(),
        });
        
        const data = Buffer.alloc(16);
        wlwDisc.copy(data, 0);
        data.writeBigUInt64LE(withdrawAmount, 8);
        console.log('[withdraw_lp_winnings] Amount bytes (LE):', data.slice(8, 16).toString('hex'));
        
        console.log('[withdraw_lp_winnings] Instruction data:', {
          discriminator: wlwDisc.toString('hex'),
          amount: instruction.withdrawAmountLamports,
          amountHex: data.slice(8, 16).toString('hex'),
          dataLength: data.length,
          fullData: data.toString('hex'),
        });
        
        const withdrawIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        console.log('[withdraw_lp_winnings] Keys:');
        keys.forEach((k, i) => {
          console.log(`  [${i}] ${k.pubkey.toBase58()}`);
          console.log(`      isWritable=${k.isWritable}, isSigner=${k.isSigner}`);
        });
        
        console.log('[withdraw_lp_winnings] Final instruction:');
        console.log('  programId:', withdrawIx.programId.toBase58());
        console.log('  dataLength:', withdrawIx.data.length);
        console.log('  dataHex:', withdrawIx.data.toString('hex'));
        console.log('  lpWallet isSigner:', keys[3].isSigner);
        console.log('===========================================');
        
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
      } else if (instruction.instruction_type === 'sweep_market_funds') {
        // sweep_market_funds — admin sweeps stuck funds from market account to admin wallet
        console.log('Creating sweep_market_funds program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = instruction.keys.map(k => ({
          pubkey: new PublicKey(k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }));
        const data = Buffer.from(instruction.instruction_data, 'base64');
        
        console.log('[sweep_market_funds] Keys:', keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })));
        
        const sweepIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(sweepIx);
      } else if (instruction.instruction_type === 'withdraw_fees') {
        // withdraw_fees — admin withdraws accumulated fees from fee vault to admin wallet
        console.log('Creating withdraw_fees program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = instruction.keys.map(k => ({
          pubkey: new PublicKey(k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }));
        const data = Buffer.from(instruction.instruction_data, 'base64');
        
        const withdrawFeesIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(withdrawFeesIx);
      } else if (instruction.instruction_type === 'sweep_market_funds') {
        // sweep_market_funds — admin sweeps stuck funds from market account to admin wallet
        console.log('Creating sweep_market_funds program instruction:', instruction);
        
        const programId = new PublicKey(instruction.programId);
        const keys = instruction.keys.map(k => ({
          pubkey: new PublicKey(k.pubkey === 'SIGNER_WALLET' ? provider.publicKey.toBase58() : k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }));
        const data = Buffer.from(instruction.instruction_data, 'base64');
        
        console.log('[sweep_market_funds] Keys:', keys.map(k => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })));
        
        const sweepIx = new TransactionInstruction({
          keys,
          programId,
          data,
        });
        
        transaction.add(sweepIx);
      }

      // Get recent blockhash for transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = provider.publicKey;

      console.log('[SolanaTransactionSigner] Transaction built, ready to send');
      console.log('[SolanaTransactionSigner] Instructions count:', transaction.instructions.length);
      
      setSignStep('signing');
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

      setSignStep('confirming');
      console.log('Waiting for confirmation (30s timeout)...');
      let confirmation;
      
      // 30-second timeout for confirmation
      const timeoutMs = 30000;
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
      
      try {
        // Try with confirmed commitment first
        confirmation = await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          'confirmed',
        );
        clearTimeout(timeoutId);
        console.log('Transaction confirmation result:', confirmation);
        
        // If confirmation fails but transaction might have succeeded, check signature status
        if (!confirmation.value?.err) {
          console.log('✓ Transaction confirmed successfully');
        }
      } catch (confirmError) {
        clearTimeout(timeoutId);
        console.log('[SolanaTransactionSigner] Confirmation failed, checking if transaction succeeded...');
        
        // Check if the transaction actually succeeded on-chain
        try {
          const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
          console.log('[SolanaTransactionSigner] Signature status:', status);
          
          if (status.value && status.value.confirmationStatus === 'confirmed') {
            console.log('✓ Transaction confirmed (delayed status update)');
            confirmation = { value: {} }; // Treat as success
          } else if (status.value?.err) {
            throw new Error('Transaction failed on-chain: ' + JSON.stringify(status.value.err));
          } else {
            throw confirmError; // Re-throw original error
          }
        } catch (statusError) {
          console.error('[SolanaTransactionSigner] Status check failed:', statusError);
          throw confirmError; // Re-throw original error
        }
      }
      
      // Retry with processed commitment if confirmed fails
      if (!confirmation && sig) {
        try {
          console.log('[SolanaTransactionSigner] Retrying with processed commitment...');
          confirmation = await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            'processed',
          );
          console.log('Transaction confirmed (processed):', confirmation);
        } catch (retryError) {
          console.error('[SolanaTransactionSigner] Retry confirmation failed:', retryError);
          throw new Error('Transaction confirmation timeout - please check Solscan');
        }
      }
      
      if (!confirmation) {
        throw new Error('Transaction confirmation timeout - please check Solscan');
      }

      // Check for on-chain errors BEFORE setting signature
      if (confirmation.value?.err) {
        console.error('Transaction failed on-chain:', confirmation.value.err);
        console.error('[SolanaTransactionSigner] Full error object:', JSON.stringify(confirmation.value.err, null, 2));
        const onChainErr = confirmation.value.err;
        
        // Extract custom error code from various possible locations
        let customCode = null;
        
        // Try direct InstructionError - log the full array structure
        if (onChainErr.InstructionError && Array.isArray(onChainErr.InstructionError)) {
          console.log('[SolanaTransactionSigner] InstructionError array:', onChainErr.InstructionError);
          console.log('[SolanaTransactionSigner] InstructionError[0]:', onChainErr.InstructionError[0]);
          console.log('[SolanaTransactionSigner] InstructionError[1]:', onChainErr.InstructionError[1]);
          
          const errorData = onChainErr.InstructionError[1];
          
          // Check for string errors like "UnsupportedProgramId"
          if (typeof errorData === 'string') {
            const stringErrors = {
              'UnsupportedProgramId': 'Program not deployed at this address on Solana',
              'InvalidAccountData': 'Invalid account data',
              'InsufficientLamports': 'Insufficient SOL',
              'AccountNotFound': 'Account not found',
            };
            const errorMsg = stringErrors[errorData] || `Program error: ${errorData}`;
            throw new Error(errorMsg);
          }
          
          // The error code might be nested differently
          if (errorData && typeof errorData === 'object') {
            // Try Custom field
            customCode = errorData.Custom;
            // Try if it's a number directly
            if (customCode === undefined && typeof errorData === 'number') {
              customCode = errorData;
            }
          }
          console.log('[SolanaTransactionSigner] Extracted error code from InstructionError:', customCode);
        }
        
        // Try nested in value
        if (customCode === null && onChainErr.value?.InstructionError) {
          customCode = onChainErr.value.InstructionError[1]?.Custom;
        }
        
        // Try nested in err
        if (customCode === null && onChainErr.err?.InstructionError) {
          customCode = onChainErr.err.InstructionError[1]?.Custom;
        }
        
        // Try parsing from message
        if (customCode === null && onChainErr.message) {
          const match = onChainErr.message.match(/Custom["\s:]*(\d+)/);
          if (match) {
            customCode = parseInt(match[1]);
          }
        }
        
        console.log('[SolanaTransactionSigner] Final extracted error code:', customCode);
        
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
          console.error('[SolanaTransactionSigner] Detailed error:', { code: customCode, message: errorMsg });
          throw new Error(`On-chain error ${customCode}: ${errorMsg}`);
        }
        
        throw new Error('Transaction failed on-chain: ' + JSON.stringify(onChainErr));
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
      setSignStep('');
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
    } else if (instruction?.instruction_type === 'settle_market_force') {
      txMessage = '✓ Market force-settled successfully!';
    } else if (instruction?.instruction_type === 'update_market_timestamps') {
      txMessage = '✓ Market timestamps updated!';
    } else if (instruction?.instruction_type === 'sweep_market_funds') {
      txMessage = '✓ Market funds swept to your wallet!';
      if (instruction.amountLamports) {
        const solAmount = (instruction.amountLamports / 1e9).toFixed(6);
        payoutInfo = `◎${solAmount} SOL received`;
      }
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
            {signStep === 'connecting' && 'Connecting...'}
            {signStep === 'signing' && 'Waiting for Phantom...'}
            {signStep === 'confirming' && 'Confirming on-chain...'}
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4 mr-2" />
            Sign Transaction
          </>
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        This transaction will be recorded on the Solana blockchain
      </p>
    </div>
  );
}