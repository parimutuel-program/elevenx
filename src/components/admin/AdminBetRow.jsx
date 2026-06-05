import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle, AlertCircle, Clock, XCircle, TrendingUp } from 'lucide-react';

export default function AdminBetRow({ bet, match, onSettle, onVoid }) {
  const [walletAddress, setWalletAddress] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('elevenx_wallet_session');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setWalletAddress(data.address);
      } catch (e) {
        console.error('[AdminBetRow] Failed to parse wallet:', e);
      }
    }
  }, []);

  const { data: marketStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['marketStatus', bet.id],
    queryFn: async () => {
      if (!bet.solana_market_pda) return null;
      const res = await base44.functions.invoke('checkMarketStatus', { marketPda: bet.solana_market_pda });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!bet.solana_market_pda,
    refetchInterval: 5000,
  });

  if (!match) return null;

  const getStatusBadge = () => {
    if (isLoadingStatus) {
      return <Badge className="bg-muted/10 text-muted-foreground border-muted/30"><Clock className="w-3 h-3 mr-1" />Loading...</Badge>;
    }

    if (!marketStatus) {
      return <Badge className="bg-secondary/10 text-secondary-foreground border-secondary/30">Not Deployed</Badge>;
    }

    const { settled, voided, paused, settlement_finalized } = marketStatus;

    if (settlement_finalized || settled) {
      return <Badge className="bg-accent/10 text-accent border-accent/30"><CheckCircle className="w-3 h-3 mr-1" />{settlement_finalized ? 'Finalized' : 'Settled'}</Badge>;
    }

    if (voided) {
      return <Badge className="bg-muted/10 text-muted-foreground border-muted/30"><XCircle className="w-3 h-3 mr-1" />Voided</Badge>;
    }

    if (paused) {
      return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30"><AlertCircle className="w-3 h-3 mr-1" />Paused</Badge>;
    }

    return <Badge className="bg-primary/10 text-primary border-primary/30"><TrendingUp className="w-3 h-3 mr-1" />Active</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-bold text-sm text-white">{match.team_a} vs {match.team_b}</h3>
          <p className="text-xs text-muted-foreground">{match.group_stage}</p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {bet.solana_market_pda && (
            <a href={`https://solscan.io/account/${bet.solana_market_pda}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />Solscan
            </a>
          )}
        </div>
      </div>

      {marketStatus && (
        <div className="bg-secondary/20 border border-border/50 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <span className="text-white font-bold">{marketStatus.status}</span>
          </div>
          {marketStatus.winning_outcome !== undefined && marketStatus.winning_outcome !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Winner:</span>
              <span className="text-accent font-bold">
                {marketStatus.winning_outcome === 0 ? 'Team A' : marketStatus.winning_outcome === 1 ? 'Team B' : 'Draw'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {!marketStatus?.settled && !marketStatus?.voided && (
          <>
            <Button onClick={() => onSettle(bet, 'a')} disabled={!walletAddress} size="sm" className="flex-1 h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg">
              Settle A
            </Button>
            <Button onClick={() => onSettle(bet, 'b')} disabled={!walletAddress} size="sm" className="flex-1 h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg">
              Settle B
            </Button>
            <Button onClick={() => onSettle(bet, 'draw')} disabled={!walletAddress} size="sm" className="flex-1 h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg">
              Settle Draw
            </Button>
            <Button onClick={() => onVoid(bet)} disabled={!walletAddress} size="sm" variant="outline" className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 rounded-lg">
              Void
            </Button>
          </>
        )}
      </div>
    </div>
  );
}