import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnimatePresence, motion } from 'framer-motion';
import { Wallet, CheckCircle, X, Clock } from 'lucide-react';
import { useWallet } from '@/lib/WalletContext';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1];

// Betting panel - BETTOR ONLY: bet against existing LP offers (mode='match' only)
// LP provision is ONLY available in LP Dashboard, not in Matches section
export default function PlaceBetPanel({ bet, matchId, mode = 'match', selectedOutcome, selectedOffer, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [instruction, setInstruction] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const { isConnected, connect, isConnecting, walletAddress } = useWallet();

  // Fetch all LP offers for this bet
  const { data: allOffers = [], refetch: refetchOffers } = useQuery({
    queryKey: ['allOffers', bet?.id],
    queryFn: async () => {
      const offers = await base44.entities.BetOffer.filter({ bet_id: bet?.id });
      console.log('[PlaceBetPanel] Fetched BetOffers:', {
        bet_id: bet?.id,
        count: offers.length,
        offers: offers.map(o => ({
          id: o.id.slice(0, 8) + '...',
          outcome: o.outcome,
          status: o.status,
          amount_unmatched: o.amount_unmatched,
          amount_offered: o.amount_offered,
          lp_wallet_address: o.lp_wallet_address?.slice(0, 20) + '...',
        })),
      });
      return offers;
    },
    enabled: !!bet?.id,
    staleTime: 0,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // For BETTORS (mode='match'): Check total available LP liquidity for selected outcome OR selected offer
  const totalLiquidityForOutcome = mode === 'match' && selectedOutcome ?
  allOffers.
  filter((o) => {
    const isValid = (o.status === 'open' || o.status === 'partially_matched') && o.outcome === selectedOutcome;
    console.log('[PlaceBetPanel] Offer filter check:', {
      offer_id: o.id,
      outcome: o.outcome,
      selectedOutcome,
      status: o.status,
      amount_unmatched: o.amount_unmatched,
      isValid,
    });
    return isValid;
  }).
  reduce((sum, o) => {
    const unmatched = parseFloat((o.amount_unmatched || 0).toFixed(9));
    return parseFloat((sum + unmatched).toFixed(9));
  }, 0) :
  0;

  // Has liquidity if either selectedOutcome has LP or selectedOffer exists
  const hasLiquidityForOutcome = selectedOutcome ? totalLiquidityForOutcome > 0 : selectedOffer ? true : false;

  console.log('[PlaceBetPanel] Liquidity calculation:', {
    selectedOutcome,
    selectedOffer: selectedOffer?.id,
    totalLiquidityForOutcome,
    hasLiquidityForOutcome,
    allOffersCount: allOffers.length,
  });

  // Calculate time remaining until betting closes
  React.useEffect(() => {
    if (!bet?.open_until) {
      setTimeRemaining(null);
      return;
    }

    const updateTime = () => {
      const now = new Date().getTime();
      const closeTime = new Date(bet.open_until).getTime();
      const diff = closeTime - now;

      if (diff <= 0) {
        setTimeRemaining(0);
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(diff % (1000 * 60 * 60 * 24) / (1000 * 60 * 60));
        const minutes = Math.floor(diff % (1000 * 60 * 60) / 60000);
        const seconds = Math.floor(diff % 60000 / 1000);
        setTimeRemaining({ days, hours, minutes, seconds, total: diff });
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [bet?.open_until]);

  const isBettingClosed = bet.status !== 'open' || timeRemaining && timeRemaining.total <= 0;

  const stakeNum = parseFloat(amount) || 0;

  // Get odds for the selected outcome
  const odds = selectedOutcome === 'a' ? bet?.odds_a : selectedOutcome === 'b' ? bet?.odds_b : bet?.odds_draw || 0;

  // For BETTORS (mode='match'): max stake is limited by total LP liquidity available
  // Bettors can only bet up to what LP holders have underwritten
  const maxMatcherStake = mode === 'match' ?
  (selectedOffer ? (selectedOffer.amount_unmatched || 0) : selectedOutcome ? totalLiquidityForOutcome : null) :
  null;

  // Bettor payout: stake * odds from the Bet entity
  const matcherPayout = stakeNum * odds;

  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  const getWalletAddress = () => {
    const s = localStorage.getItem('elevenx_wallet_session');
    if (!s) return null;
    try {const p = JSON.parse(s);return (p.address || p)?.toString().trim();} catch {return s?.toString().trim();}
  };

  const validateWalletAddress = (addr) => {
    if (!addr || typeof addr !== 'string') {
      console.error('[PlaceBetPanel] Wallet address is not a string:', addr, 'type:', typeof addr);
      return false;
    }
    const trimmed = addr.trim();
    const valid = base58Regex.test(trimmed);
    if (!valid) {
      console.error('[PlaceBetPanel] Invalid address:', trimmed);
      console.error('[PlaceBetPanel] Length:', trimmed.length);
      // Find specific invalid chars
      const invalid = trimmed.split('').filter((c) => !/^[1-9A-HJ-NP-Za-km-z]$/.test(c));
      if (invalid.length > 0) {
        console.error('[PlaceBetPanel] Invalid chars:', invalid.map((c, i) => `'${c}'@pos${i}(code${c.charCodeAt(0)})`).join(', '));
      }
    }
    return valid;
  };

  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(null);
  const [lastSignature, setLastSignature] = useState(null);
  const [lastInstruction, setLastInstruction] = useState(null);

  const handleReconnect = async () => {
    localStorage.removeItem('elevenx_wallet_session');
    window.location.reload();
  };

  const handleGetInstruction = async () => {
    // Use walletAddress from context instead of localStorage
    const wallet = (walletAddress || getWalletAddress())?.trim();
    console.log('[PlaceBetPanel] handleGetInstruction called:', {
      mode,
      wallet,
      walletAddress,
      walletSource: walletAddress ? 'context' : 'localStorage',
      walletValid: validateWalletAddress(wallet),
      bet_id: bet?.id,
      matchId,
      selectedOutcome,
      selectedOffer: selectedOffer?.id,
      stakeNum
    });

    // Debug: show both wallets
    console.log('[PlaceBetPanel] Context walletAddress:', walletAddress);
    console.log('[PlaceBetPanel] LocalStorage wallet:', getWalletAddress());

    if (!wallet) {setPrepareError('Wallet not connected');return;}

    if (!validateWalletAddress(wallet)) {
      console.error('[PlaceBetPanel] Invalid wallet address:', wallet);
      setPrepareError('Invalid wallet address — please reconnect your wallet');
      return;
    }

    setIsPreparing(true);
    setPrepareError(null);
    try {
      console.log('[PlaceBetPanel] === BETTING REQUEST ===', {
        wallet_full: wallet,
        wallet_length: wallet?.length,
        wallet_trimmed: wallet?.trim(),
        mode,
        bet_id: bet?.id,
        matchId
      });

      let res;
      if (selectedOffer) {
        // Validate offer has unmatched liquidity
        if ((selectedOffer.amount_unmatched || 0) <= 0) {
          throw new Error('This offer is fully matched. Select another offer.');
        }
        console.log('[PlaceBetPanel] Calling matchBet with wallet:', wallet);
        res = await base44.functions.invoke('matchBet', {
          offer_id: selectedOffer.id,
          amount: stakeNum,
          wallet_address: wallet
        });
        console.log('[PlaceBetPanel] matchBet response:', res.data);
      } else {
        console.log('[PlaceBetPanel] Betting on outcome (needs LP offer):', wallet);
        // Bettor clicked odds but no LP exists - block with clear message
        throw new Error('No LP liquidity available for this outcome. Wait for someone to add LP, or go to LP Dashboard to add liquidity yourself.');
      }
      if (res.data?.error) throw new Error(res.data.error);
      // Include commit_data in instruction for post-tx commit
      setInstruction({
        ...res.data.solana_instruction,
        commit_data: res.data.commit_data
      });
    } catch (err) {
      console.error('[PlaceBetPanel] Error in handleGetInstruction:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to prepare transaction';
      setPrepareError(msg);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleTransactionSuccess = async (result) => {
    console.log('[PlaceBetPanel] Transaction success!', result);
    setAmount('');
    setLastSignature(result.signature);
    setLastInstruction(instruction);

    // Commit to database after transaction succeeds
    try {
      const commitPayload = {
        signature: result.signature,
        commit_data: instruction.commit_data
      };

      const commitFunction = 'commitMatchBet';
      console.log('[PlaceBetPanel] Calling commit function:', commitFunction, commitPayload);

      const commitRes = await base44.functions.invoke(commitFunction, commitPayload);

      if (commitRes.data.error) {
        console.error('[PlaceBetPanel] Commit failed:', commitRes.data.error);
        // Show error but don't block - transaction still succeeded on-chain
      } else {
        console.log('[PlaceBetPanel] Commit successful:', commitRes.data);
      }
    } catch (commitErr) {
      console.error('[PlaceBetPanel] Commit error:', commitErr);
      // Transaction succeeded, commit failure is logged but doesn't block UX
    }

    // Keep showing success message for 5.5 seconds before calling parent callback
    const timer = setTimeout(() => {
      setInstruction(null);
      onSuccess && onSuccess(result);
    }, 5500);
    // Store timer reference for manual cleanup
    return () => clearTimeout(timer);
  };

  const handleCloseSuccess = () => {
    setLastSignature(null);
    setLastInstruction(null);
    setInstruction(null);
  };

  const handleTransactionError = (error) => {
    console.error('Transaction failed:', error);
  };

  const outcomeLabel = selectedOutcome ?
  selectedOutcome === 'a' ? bet?.outcome_a : selectedOutcome === 'b' ? bet?.outcome_b : 'Draw' :
  selectedOffer ?
  selectedOffer.outcome === 'a' ? bet?.outcome_b : selectedOffer.outcome === 'b' ? bet?.outcome_a : 'Not Draw' :
  '';

  if (!isConnected) {
    return (
      <div className="bg-card border border-primary/20 rounded-2xl p-5 text-center">
        <Wallet className="w-8 h-8 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium mb-3">Connect wallet to place bet</p>
        <Button onClick={connect} disabled={isConnecting} className="bg-primary hover:bg-primary/90 font-heading font-bold h-10 rounded-xl px-6">
          Connect Phantom
        </Button>
      </div>);

  }

  return (
    <div className="bg-card border border-primary/20 rounded-2xl p-5 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <h3 className="font-heading font-bold text-base">
            {selectedOffer ? `Bet Against ${selectedOffer.outcome_label}` : `Bet on ${outcomeLabel}`}
          </h3>
          {timeRemaining && timeRemaining.total > 0 &&
          <div className="flex items-center gap-1.5 bg-destructive/10 text-destructive px-2.5 py-1 rounded-full text-xs font-bold animate-pulse">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[9px] mr-0.5">Betting closes in</span>
              {timeRemaining.days > 0 ?
            `${timeRemaining.days}d ${timeRemaining.hours}h` :
            timeRemaining.hours > 0 ?
            `${timeRemaining.hours}h ${timeRemaining.minutes}m` :
            `${timeRemaining.minutes}:${String(timeRemaining.seconds).padStart(2, '0')}`
            }
            </div>
          }
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedOffer ?
          `Max stake: ◎${Number(maxMatcherStake || 0).toFixed(4)} @ ${odds.toFixed(2)}x — locked immediately` :
          hasLiquidityForOutcome ?
          `Max stake: ◎${Number(maxMatcherStake || 0).toFixed(4)} — limited by available LP liquidity` :
          '⚠️ No LP liquidity available — visit LP Dashboard to add'
          }
        </p>

        {/* Block betting when mode='match' but no LP liquidity exists */}
        {mode === 'match' && selectedOutcome && !hasLiquidityForOutcome &&
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">🚫</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-destructive mb-1">No Liquidity Available</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  No LP has been provided for <strong>{selectedOutcome === 'a' ? bet?.outcome_a : selectedOutcome === 'b' ? bet?.outcome_b : 'Draw'}</strong> yet.
                </p>
              </div>
            </div>
            <div className="bg-card/50 rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-medium text-foreground">To enable betting on this outcome:</p>
              <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Go to <strong>LP Dashboard</strong></li>
                <li>Select this match</li>
                <li>Choose <strong>{selectedOutcome === 'a' ? bet?.outcome_a : selectedOutcome === 'b' ? bet?.outcome_b : 'Draw'}</strong></li>
                <li>Add liquidity (minimum ◎0.1)</li>
              </ol>
            </div>
            <a href="/lp" className="block text-center bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary font-bold text-xs py-2 rounded-lg transition-colors">
              → Go to LP Dashboard
            </a>
          </div>
        }
        
        {/* Block betting when mode='match' and selectedOffer but no unmatched liquidity */}
        {mode === 'match' && selectedOffer && (selectedOffer.amount_unmatched || 0) <= 0 &&
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">⚠️</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-destructive mb-1">Offer Fully Matched</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  This offer for <strong>{selectedOffer.outcome_label}</strong> has no remaining liquidity.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">
                Choose another offer from the Liquidity Pool, or go to <strong>LP Dashboard</strong> to add your own liquidity.
              </p>
              <a href="/lp" className="block text-center bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-bold text-xs py-2 rounded-lg transition-colors">
                → Add Liquidity Instead
              </a>
            </div>
          </div>
        }
        




















        
      </div>

      <div>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          min={0}
          max={maxMatcherStake !== null ? maxMatcherStake : undefined}
          step="any"
          onChange={(e) => setAmount(e.target.value)}
          className="bg-secondary/50 border-border/50 text-lg font-heading font-bold h-12" />
        
        <div className="flex gap-2 mt-2 flex-wrap">
          {mode === 'match' && maxMatcherStake !== null && maxMatcherStake <= 0 ? null :
          mode === 'match' && selectedOffer && (selectedOffer.amount_unmatched || 0) <= 0 ? null :

          <>
              {QUICK_AMOUNTS.map((qa) => {
              const capped = maxMatcherStake !== null ? Math.min(qa, maxMatcherStake) : qa;
              return (
                <button key={qa} onClick={() => setAmount(String(Number(capped).toFixed(4)))}
                className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
                    ◎{qa}
                  </button>);

            })}
              {maxMatcherStake !== null && maxMatcherStake > 0 &&
            <button onClick={() => setAmount(String(Number(maxMatcherStake).toFixed(4)))}
            className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors">
                  Max ◎{Number(maxMatcherStake).toFixed(4)}
                </button>
            }
            </>
          }
        </div>
      </div>

      <AnimatePresence>
        {stakeNum > 0 && mode === 'match' &&
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
        className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-2 text-xs overflow-hidden">
            <p className="font-bold text-foreground mb-1">Bet Summary</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Backing</span>
              <span className="font-bold">{outcomeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Your stake</span>
              <span className="font-bold">◎{stakeNum.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Odds locked at</span>
              <span className="font-bold">{odds.toFixed(2)}x</span>
            </div>
            <div className="h-px bg-border/30 my-1" />
            <div className="flex justify-between font-bold text-sm">
              <span>Payout if you win</span>
              <span className="text-accent text-base">◎{matcherPayout.toFixed(4)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Funds locked immediately — cannot be withdrawn</p>
          </motion.div>
        }
      </AnimatePresence>

      {/* Block betting when no LP liquidity exists */}
      



      
      
      {/* Warn when stake exceeds available LP coverage */}
      {stakeNum > 0 && mode === 'match' && maxMatcherStake && stakeNum > maxMatcherStake &&
      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 space-y-1.5">
        <p className="text-xs text-destructive font-bold text-center">⚠️ Stake Exceeds Available Liquidity</p>
        <p className="text-[10px] text-destructive/80 text-center leading-relaxed">
          Maximum bet for this outcome is <strong>◎{maxMatcherStake.toFixed(4)}</strong> based on current LP coverage. 
          Reduce your stake or wait for more LP liquidity.
        </p>
      </div>
      }

      {timeRemaining && timeRemaining.total <= 0 &&
      <p className="text-xs text-destructive text-center font-bold">⏰ Betting has closed for this match</p>
      }
      {prepareError && prepareError.includes('reconnect') &&
      <Button onClick={handleReconnect} className="w-full h-8 text-xs bg-secondary hover:bg-secondary/80 rounded-lg mb-2">
          Reconnect Wallet
        </Button>
      }
      {prepareError &&
      <p className="text-xs text-destructive text-center">{prepareError}</p>
      }

      {lastSignature ?
      <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 relative">
          <button
          onClick={handleCloseSuccess}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors">
          
            <X className="w-4 h-4" />
          </button>
          <div className="text-center">
            <CheckCircle className="w-8 h-8 text-accent mx-auto mb-2" />
            <p className="font-heading font-bold text-sm text-accent">✓ Bet placed successfully!</p>
            {lastInstruction?.amountLamports &&
          <p className="font-heading font-bold text-lg text-accent mt-1">
                ◎{(lastInstruction.amountLamports / 1e9).toFixed(4)} SOL staked
              </p>
          }
            <p className="font-heading font-bold text-sm text-accent mt-2">Good luck! 🍀</p>
            <div className="mt-3 pt-3 border-t border-accent/20">
              <p className="text-xs text-muted-foreground mb-1">Transaction on Solana</p>
              <a
              href={`https://solscan.io/tx/${lastSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-xs font-bold hover:underline">
              
                View on Solscan →
                <span className="font-mono text-[10px] text-muted-foreground">{lastSignature.slice(0, 8)}...{lastSignature.slice(-8)}</span>
              </a>
            </div>
          </div>
        </div> :
      instruction ?
      <SolanaTransactionSigner
        instruction={instruction}
        amount={stakeNum}
        onSuccess={handleTransactionSuccess}
        onError={handleTransactionError} /> :


      <Button
        onClick={handleGetInstruction}
        disabled={stakeNum <= 0 || isPreparing || timeRemaining && timeRemaining.total <= 0 || mode === 'match' && !hasLiquidityForOutcome || mode === 'match' && maxMatcherStake && stakeNum > maxMatcherStake}
        className="w-full h-12 font-heading font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
        
          {timeRemaining && timeRemaining.total <= 0 ?
        <>
              <Clock className="w-4 h-4 mr-2" />
              Betting Closed
            </> :
        mode === 'match' && !hasLiquidityForOutcome ?
        <>
              <X className="w-4 h-4 mr-2" />
              No LP — Go to LP Dashboard
            </> :
        isPreparing ? 'Preparing...' :
        `Bet ◎${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'}`
        }
        </Button>
      }
    </div>);

}