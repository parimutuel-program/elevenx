import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Plus, RefreshCw, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function AdminMatchRow({ match, bets, index }) {
  const queryClient = useQueryClient();
  const existingBet = bets.find(b => b.match_id === match.id);
  const [pendingMarketInit, setPendingMarketInit] = useState(null);

  const { data: marketStatus, isLoading: isLoadingStatus, error: marketStatusError } = useQuery({
    queryKey: ['marketStatus', match.id],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('checkMarketStatus', { match_id: match.id });
        return res.data;
      } catch (err) {
        if (err.response?.status === 429 || err.message?.includes('rate limit')) {
          console.warn('Rate limited - skipping market status check for match:', match.id);
          return null;
        }
        throw err;
      }
    },
    staleTime: 120000, // Cache for 2 minutes to reduce API calls
    retry: (failureCount, error) => {
      // Don't retry on 429 rate limit errors
      if (error.response?.status === 429 || error.message?.includes('rate limit')) return false;
      return failureCount < 2;
    },
  });

  // Use on-chain status if available, otherwise fall back to DB
  const isMarketInitialized = marketStatus?.status === 'initialized' || (!marketStatus && existingBet?.solana_market_created);

  const createBetMutation = useMutation({
    mutationFn: async () => {
      console.log('[createBetMutation] Creating bet for match:', match.id);
      const bet = await base44.entities.Bet.create({
        match_id: match.id,
        title: `${match.team_a} vs ${match.team_b}`,
        outcome_a: match.team_a,
        outcome_b: match.team_b,
        outcome_draw: 'Draw',
        open_until: match.match_time,
        status: 'open',
        fee_percent: 0,
        odds_a: 2.1,
        odds_b: 2.1,
        odds_draw: 2.1,
        lp_amount_a: 0, lp_amount_b: 0, lp_amount_draw: 0,
        total_pool: 0, total_bettors: 0,
      });
      
      console.log('[createBetMutation] Bet created:', bet.id);
      
      // Retry logic for rate limits
      let marketRes;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          console.log('[createBetMutation] Calling createMarketOnChain (attempt', retries + 1, ')');
          marketRes = await base44.functions.invoke('createMarketOnChain', {
            bet_id: bet.id,
            match_id: match.id,
          });
          break; // Success, exit retry loop
        } catch (err) {
          if ((err.response?.status === 429 || err.message?.includes('rate limit')) && retries < maxRetries - 1) {
            retries++;
            const delay = 5000 * retries; // 5s, 10s, 15s
            console.log('[createBetMutation] Rate limited, waiting', delay, 'ms...');
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw err;
          }
        }
      }
      
      console.log('[createBetMutation] createMarketOnChain response:', marketRes.data);
      
      if (marketRes.data.needsPlatformInit && marketRes.data.solana_instruction) {
        setPendingMarketInit({
          instruction: marketRes.data.solana_instruction,
          createMarketInstruction: marketRes.data.createMarketInstruction,
          betId: bet.id,
          step: 'platform_init',
        });
      } else if (marketRes.data.createMarketInstruction) {
        setPendingMarketInit({
          instruction: marketRes.data.createMarketInstruction,
          betId: bet.id,
          step: 'create_market',
        });
      } else if (marketRes.data.error) {
        throw new Error('Failed to get market instruction: ' + marketRes.data.error);
      }
      
      return bet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['marketStatus', match.id] });
    },
    onError: (error) => {
      console.error('[createBetMutation] Error:', error);
      if (error.response?.status === 429) {
        alert('Rate limit exceeded. Please wait 30 seconds and try again.');
      } else {
        alert('Failed to create market: ' + error.message);
      }
    },
  });

  const handleMarketInitSuccess = async (txResult) => {
    const signature = txResult.signature;
    console.log('[AdminMatchRow] Transaction confirmed:', signature);
    console.log('[AdminMatchRow] txResult:', txResult);
    console.log('[AdminMatchRow] pendingMarketInit:', pendingMarketInit);
    
    // If this was platform init, now show create market instruction
    if (pendingMarketInit?.step === 'platform_init' && pendingMarketInit?.createMarketInstruction) {
      console.log('[AdminMatchRow] Platform initialized, now creating market...');
      setPendingMarketInit({
        instruction: pendingMarketInit.createMarketInstruction,
        betId: pendingMarketInit.betId,
        step: 'create_market',
      });
      return;
    }
    
    // Commit the market data to database AFTER successful on-chain transaction
    const betIdToCommit = txResult.betId || pendingMarketInit?.betId;
    const marketPda = txResult.marketPda || pendingMarketInit?.instruction?.accounts?.market;
    
    console.log('[AdminMatchRow] Committing to DB - betId:', betIdToCommit, 'marketPda:', marketPda);
    
    if (betIdToCommit && marketPda) {
      try {
        await base44.entities.Bet.update(betIdToCommit, { 
          solana_market_pda: marketPda,
          solana_market_created: true,
        });
        console.log('[AdminMatchRow] ✓ Updated bet with solana_market_pda after successful transaction');
      } catch (err) {
        console.error('[AdminMatchRow] Failed to update bet:', err);
      }
    }
    
    setPendingMarketInit(null);
    queryClient.invalidateQueries({ queryKey: ['bets'] });
    queryClient.invalidateQueries({ queryKey: ['marketStatus', match.id] });
    alert('✓ Market initialized on-chain!\n\nYou can now provide liquidity and place bets.');
  };

  const handleMarketInitError = (err) => {
    console.error('[AdminMatchRow] Transaction error:', err);
    console.error('[AdminMatchRow] Error details:', {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
    });
    setPendingMarketInit(null);
    // Show more specific error message
    let errorMsg = err.message || 'Unknown error';
    
    // Extract on-chain error code if present
    if (errorMsg.includes('On-chain error')) {
      errorMsg = errorMsg + '\n\nThis usually means the wallet address doesn\'t match the platform admin.';
    }
    
    alert('❌ Market initialization failed:\n' + errorMsg);
  };

  const updateStatusMutation = useMutation({
    mutationFn: (status) => base44.entities.Match.update(match.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  const deleteMatchMutation = useMutation({
    mutationFn: async () => {
      if (!confirm(`Delete this match?\n\n${match.team_a} vs ${match.team_b}\n\nThis will also delete the associated bet if exists.`)) {
        return;
      }
      
      // Delete associated bet first if exists
      if (existingBet) {
        await base44.entities.Bet.delete(existingBet.id);
      }
      
      // Delete the match
      await base44.entities.Match.delete(match.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches', 'bets'] });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-xl"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{match.team_a_flag || '🏳️'}</span>
        <div>
          <p className="font-heading font-bold text-sm">{match.team_a} vs {match.team_b}</p>
          <p className="text-[10px] text-muted-foreground">
            {match.match_time ? format(new Date(match.match_time), 'MMM d, HH:mm') : 'TBD'} · {match.venue || 'TBD'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge className="text-[10px] bg-secondary text-secondary-foreground">{match.status}</Badge>
        <Select value={match.status} onValueChange={(v) => updateStatusMutation.mutate(v)}>
          <SelectTrigger className="w-28 h-8 text-xs bg-secondary/50 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="finished">Finished</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => deleteMatchMutation.mutate()}
          disabled={deleteMatchMutation.isPending}
          className="h-8 w-8 p-0 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        {existingBet && !pendingMarketInit && (
          <Button
            size="sm"
            onClick={() => {
              console.log('Initializing market for match:', match.id, match.team_a, 'vs', match.team_b);
              createBetMutation.mutate();
            }}
            disabled={createBetMutation.isPending}
            className="h-8 text-xs bg-primary text-primary-foreground font-heading rounded-lg"
          >
            {createBetMutation.isPending ? (
              <><div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" /> Creating...</>
            ) : (
              <><Plus className="w-3 h-3 mr-1" /> Initialize Market</>
            )}
          </Button>
        )}
        
        {existingBet && marketStatus?.status === 'initialized' && !pendingMarketInit && (
          <Badge className="bg-accent/20 text-accent text-[10px] py-1 px-3 rounded-lg">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Ready for Betting
          </Badge>
        )}
        {pendingMarketInit && (
          <div className="w-64">
            <SolanaTransactionSigner
              instruction={pendingMarketInit.instruction}
              amount={0}
              betId={pendingMarketInit.betId}
              onSuccess={handleMarketInitSuccess}
              onError={handleMarketInitError}
            />
          </div>
        )}
        {isLoadingStatus && existingBet && (
          <Badge className="bg-secondary text-secondary-foreground text-[10px]">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Checking...
          </Badge>
        )}
        
        {existingBet && marketStatus?.status === 'not_created' && !pendingMarketInit && (
          <Badge className="bg-destructive/20 text-destructive text-[10px] py-1 px-3 rounded-lg">
            <AlertCircle className="w-3 h-3 mr-1" /> DB Sync Error
          </Badge>
        )}
      </div>
    </motion.div>
  );
}