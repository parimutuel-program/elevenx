import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AnimatePresence, motion } from 'framer-motion';
import { Wallet, CheckCircle, X, Clock, Zap } from 'lucide-react';
import { useWallet } from '@/lib/WalletContext';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';
import { callBackendFunction } from '@/lib/directFunctionCall';

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1];

// Betting panel - BETTOR ONLY: bet against existing LP offers (mode='match' only)
// LP provision is ONLY available in LP Dashboard, not in Matches section
export default function PlaceBetPanel({ bet, matchId, mode = 'match', selectedOutcome, selectedOffer, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [instruction, setInstruction] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const { isConnected, connect, isConnecting, walletAddress } = useWallet();
  const queryClient = useQueryClient();

  // Fetch all LP offers for this bet
  const { data: allOffers = [], refetch: refetchOffers } = useQuery({
    queryKey: ['allOffers', bet?.id],
    queryFn: async () => {
      const offers = await base44.entities.BetOffer.filter({ bet_id: bet?.id });
      console.log('[PlaceBetPanel] Fetched BetOffers:', {
        bet_id: bet?.id,
        count: offers.length,
        offers: offers.map((o) => ({
          id: o.id.slice(0, 8) + '...',
          outcome: o.outcome,
          status: o.status,
          amount_unmatched: o.amount_unmatched,
          amount_offered: o.amount_offered,
          lp_wallet_address: o.lp_wallet_address?.slice(0, 20) + '...'
        }))
      });
      return offers;
    },
    enabled: !!bet?.id,
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: false
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
      isValid
    });
    return isValid;
  }).
  reduce((sum, o) => {
    const unmatched = parseFloat((o.amount_unmatched || 0).toFixed(9));
    return parseFloat((sum + unmatched).toFixed(9));
  }, 0) :
  0;

  // Fixed odds mode: bet against existing LP offers
  const hasLiquidityForOutcome = selectedOutcome ? totalLiquidityForOutcome > 0 : selectedOffer ? true : false;

  // Betting mode: fixed_lp (bet against LP) or no_liquidity (wait for LP)
  const bettingMode = totalLiquidityForOutcome > 0 || selectedOffer ? 'fixed_lp' : 'no_liquidity';

  console.log('[PlaceBetPanel] Liquidity calculation:', {
    selectedOutcome,
    selectedOffer: selectedOffer?.id,
    totalLiquidityForOutcome,
    hasLiquidityForOutcome,
    allOffersCount: allOffers.length
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

  // Get fixed odds from The Odds API for the selected outcome
  const fixedOdds = selectedOutcome === 'a' ? bet?.odds_a : selectedOutcome === 'b' ? bet?.odds_b : bet?.odds_draw || 0;
  const odds = fixedOdds;

  // Calculate max stake based on available LP liquidity
  const maxMatcherStake = bettingMode === 'fixed_lp' ?
  selectedOffer ?
  parseFloat((selectedOffer.amount_unmatched || 0).toFixed(4)) :
  parseFloat(totalLiquidityForOutcome.toFixed(4)) :
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

  const handleMaxBet = () => {
    if (maxMatcherStake && maxMatcherStake > 0) {
      // Set amount to max available liquidity (already calculated with precision)
      setAmount(maxMatcherStake.toFixed(4));
    }
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
      stakeNum,
      amount_unmatched: selectedOffer?.amount_unmatched
    });

    // Debug: show both wallets
    console.log('[PlaceBetPanel] Context walletAddress:', walletAddress);
    console.log('[PlaceBetPanel] LocalStorage wallet:', getWalletAddress());

    if (!wallet) {setPrepareError('Wallet not connected');return;}

    const parsedAmount = parseFloat(String(amount).replace(',', '.'));
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setPrepareError('Please enter a valid SOL amount');
      return;
    }

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
        matchId,
        selectedOffer: selectedOffer?.id,
        stakeNum
      });

      let res;
      if (selectedOffer) {
        // Validate offer has unmatched liquidity
        const unmatched = parseFloat((selectedOffer.amount_unmatched || 0).toFixed(9));
        console.log('[PlaceBetPanel] Selected offer details:', {
          offer_id: selectedOffer.id,
          amount_unmatched: unmatched,
          amount_offered: selectedOffer.amount_offered,
          amount_matched: selectedOffer.amount_matched,
          status: selectedOffer.status
        });
        if (unmatched <= 0) {
          throw new Error('This offer is fully matched. Select another offer.');
        }
        console.log('[PlaceBetPanel] Calling matchBet with wallet:', wallet, 'offer:', selectedOffer.id, 'amount:', stakeNum);
        res = await callBackendFunction('matchBet', {
          offer_id: selectedOffer.id,
          amount: stakeNum,
          wallet_address: wallet
        });
        console.log('[PlaceBetPanel] matchBet response:', res.data);
      } else if (selectedOutcome) {
        // User clicked odds - auto-select first available offer
        const firstAvailableOffer = allOffers.find((o) =>
        (o.status === 'open' || o.status === 'partially_matched') &&
        o.outcome === selectedOutcome &&
        (o.amount_unmatched || 0) > 0
        );
        if (firstAvailableOffer) {
          console.log('[PlaceBetPanel] Auto-selecting offer:', firstAvailableOffer.id);
          res = await callBackendFunction('matchBet', {
            offer_id: firstAvailableOffer.id,
            amount: stakeNum,
            wallet_address: wallet
          });
          console.log('[PlaceBetPanel] matchBet response:', res.data);
        } else {
          // No DB offer found — fall back to parimutuel (bet directly into on-chain pool)
          console.log('[PlaceBetPanel] No DB offer found, using parimutuel placeBet for outcome:', selectedOutcome);
          res = await callBackendFunction('placeBet', {
            walletAddress: wallet,
            bet_id: bet?.id,
            match_id: matchId,
            outcome: selectedOutcome,
            amount: stakeNum,
          });
          console.log('[PlaceBetPanel] placeBet (parimutuel) response:', res.data);
        }
      }
      // Check for errors in response
      console.log('[PlaceBetPanel] Full response:', res);
      console.log('[PlaceBetPanel] Response data:', res.data);
      
      if (!res.data) {
        console.error('[PlaceBetPanel] No data in response');
        throw new Error('Backend function returned no data');
      }
      if (res.data.error) {
        console.error('[PlaceBetPanel] Error in response:', res.data.error);
        throw new Error(res.data.error);
      }
      if (!res.data.solana_instruction) {
        console.error('[PlaceBetPanel] Missing solana_instruction in response:', res.data);
        throw new Error('Failed to generate transaction instruction - market may not be deployed');
      }
      // Include commit_data in instruction for post-tx commit
      // Store commit_data separately so handleTransactionSuccess can use it
      setInstruction({
        ...res.data.solana_instruction,
        _commit_data: res.data.commit_data,
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
        commit_data: instruction._commit_data,
      };

      const commitFunction = 'commitMatchBet';
      console.log('[PlaceBetPanel] Calling commit function:', commitFunction, commitPayload);

      const commitRes = await callBackendFunction(commitFunction, commitPayload);

      if (commitRes.data.error) {
        console.error('[PlaceBetPanel] Commit failed:', commitRes.data.error);
      } else {
        console.log('[PlaceBetPanel] Commit successful:', commitRes.data);
        // Invalidate queries to refresh LP liquidity data IMMEDIATELY
        await queryClient.invalidateQueries({ queryKey: ['allOffers', bet?.id] });
        await queryClient.invalidateQueries({ queryKey: ['offers', bet?.id] });
        await queryClient.invalidateQueries({ queryKey: ['betsForMatch', matchId] });
        // Force immediate refetch and wait for it
        await refetchOffers();
        // Give React Query time to update the data
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (commitErr) {
      console.error('[PlaceBetPanel] Commit error:', commitErr);
    }

    // DON'T auto-close or call onSuccess - let user see success message and close manually
    // This matches the LP panel behavior
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
    <div className="bg-card border border-primary/20 rounded-xl p-3 space-y-3">
      {/* Betting Closed Banner */}
      {timeRemaining && timeRemaining.total <= 0 &&
      <div className="bg-destructive/15 border border-destructive/30 rounded-lg p-2.5 text-center">
          <p className="font-heading font-bold text-xs text-destructive">⏰ Betting Has Closed</p>
        </div>
      }

      <div className="space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h3 className={`font-heading font-bold text-sm ${timeRemaining && timeRemaining.total <= 0 ? 'opacity-50' : ''}`}>
              {selectedOffer ? `Bet Against ${selectedOffer.outcome_label}` : `Bet on ${outcomeLabel}`}
            </h3>
            {timeRemaining && timeRemaining.total > 0 &&
            <Badge className="border border-accent/30 text-[9px] font-bold px-1.5 py-0 text-accent bg-accent/10">
                OPEN
              </Badge>
            }
          </div>
          {timeRemaining && timeRemaining.total > 0 &&
          <div className="flex items-center gap-1 text-[10px] font-bold text-destructive/80">
              <Clock className="w-3 h-3" />
              {timeRemaining.days > 0 ?
            `${timeRemaining.days}d ${timeRemaining.hours}h left` :
            timeRemaining.hours > 0 ?
            `${timeRemaining.hours}h ${timeRemaining.minutes}m left` :
            `${timeRemaining.minutes}:${String(timeRemaining.seconds).padStart(2, '0')} left`
            }
            </div>
          }
        </div>

        {/* Liquidity info row */}
        {bettingMode === 'fixed_lp' &&
        <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2 border border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Available</span>
              <span className="font-heading font-bold text-sm text-primary">◎{maxMatcherStake.toFixed(4)}</span>
              <Badge className="bg-primary/15 text-primary text-[8px] font-bold px-1 py-0">FIXED {odds.toFixed(2)}x</Badge>
            </div>
            <button onClick={() => refetchOffers()} className="text-[9px] text-primary/70 hover:text-primary font-medium">↻ refresh</button>
          </div>
        }

        {/* No liquidity */}
        {mode === 'match' && selectedOutcome && !hasLiquidityForOutcome &&
        <div className="bg-secondary/30 border border-border/30 rounded-lg p-2.5 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">⏳ No LP liquidity yet</p>
            <a href={`/lp?matchId=${matchId}`} className="bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-bold text-[10px] py-1 px-2.5 rounded-lg transition-colors">
              Add Liquidity
            </a>
          </div>
        }
        
        {mode === 'match' && selectedOffer && (selectedOffer.amount_unmatched || 0) <= 0 &&
        <div className="bg-secondary/30 border border-border/30 rounded-lg p-2.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Offer fully matched</p>
          <a href={`/lp?matchId=${matchId}`} className="bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-bold text-[10px] py-1 px-2.5 rounded-lg transition-colors">
            Add Liquidity
          </a>
        </div>
        }
        




















        
      </div>

      {/* Stake input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className={`text-[10px] font-bold text-muted-foreground uppercase tracking-wider ${timeRemaining && timeRemaining.total <= 0 ? 'opacity-50' : ''}`}>Stake (SOL)</label>
          {bettingMode === 'fixed_lp' && maxMatcherStake && maxMatcherStake > 0 &&
          <button
            onClick={handleMaxBet}
            disabled={isBettingClosed}
            className="text-[10px] font-bold bg-accent/20 hover:bg-accent/30 text-accent px-2 py-0.5 rounded transition-colors disabled:opacity-50">
              MAX ◎{maxMatcherStake.toFixed(4)}
            </button>
          }
        </div>
        <Input
          type="number"
          inputMode="decimal"
          placeholder={isBettingClosed ? "Betting Closed" : "0.00"}
          value={amount}
          min={0}
          max={maxMatcherStake !== null ? maxMatcherStake : undefined}
          step="any"
          onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
          disabled={isBettingClosed}
          className="bg-secondary/50 border-border/50 text-base font-heading font-bold h-10 disabled:opacity-50 disabled:cursor-not-allowed" />
        
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_AMOUNTS.map((qa) =>
          <button
            key={qa}
            onClick={() => setAmount(String(Number(qa).toFixed(4)))}
            disabled={isBettingClosed}
            className="px-2.5 py-1 text-[10px] font-bold bg-secondary hover:bg-secondary/80 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border/40">
              ◎{qa}
            </button>
          )}
        </div>
      </div>

      {/* Bet summary */}
      <AnimatePresence>
      {stakeNum > 0 && mode === 'match' &&
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
        className="bg-accent/5 border border-accent/20 rounded-lg p-3 space-y-1.5 text-xs overflow-hidden">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Backing</span>
            <span className="font-bold">{outcomeLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stake</span>
            <span className="font-bold">◎{stakeNum.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Odds</span>
            <span className="font-bold">{odds.toFixed(2)}x</span>
          </div>
          <div className="h-px bg-border/30" />
          <div className="flex justify-between font-bold">
            <span>Payout if win</span>
            <span className="text-accent">◎{matcherPayout.toFixed(4)}</span>
          </div>
        </motion.div>
        }
      </AnimatePresence>


      



      
      {prepareError && prepareError.includes('reconnect') &&
      <Button onClick={handleReconnect} className="w-full h-8 text-xs bg-secondary hover:bg-secondary/80 rounded-lg mb-2">
          Reconnect Wallet
        </Button>
      }
      {prepareError &&
      <p className="text-xs text-destructive text-center">{prepareError}</p>
      }

      {lastSignature ?
      <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 space-y-3">
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
              href={`https://solscan.io/tx/${lastSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-xs font-bold hover:underline">
              
                View on Solscan →
                <span className="font-mono text-[10px] text-muted-foreground">{lastSignature.slice(0, 8)}...{lastSignature.slice(-8)}</span>
              </a>
            </div>
          </div>
          <button
            onClick={handleCloseSuccess}
            className="w-full h-10 rounded-xl border border-accent/30 text-xs font-bold text-accent hover:bg-accent/10 transition-colors">
            Close
          </button>
        </div> :
      instruction ?
      <SolanaTransactionSigner
        instruction={instruction}
        amount={stakeNum}
        onSuccess={handleTransactionSuccess}
        onError={handleTransactionError} /> :


      <Button
        onClick={handleGetInstruction}
        disabled={stakeNum <= 0 || isPreparing || isBettingClosed}
        className="w-full h-12 font-heading font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
        {timeRemaining && timeRemaining.total <= 0 ? (
          <><Clock className="w-4 h-4 mr-2" />Betting Closed</>
        ) : isPreparing ? 'Preparing...' : (
          `Bet ◎${stakeNum > 0 ? stakeNum.toFixed(2) : '0.00'} @ ${odds.toFixed(2)}x`
        )}
        </Button>
      }
    </div>);

}