import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/AuthContext';

export default function OfferBook({ betId, bet, onSelectOffer }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['offers', betId],
    queryFn: () => base44.entities.BetOffer.filter({ bet_id: betId }),
    enabled: !!betId,
    refetchInterval: 10000,
  });

  const { data: userBets = [] } = useQuery({
    queryKey: ['userBets', betId],
    queryFn: () => base44.entities.UserBet.filter({ bet_id: betId, role: 'matcher' }),
    enabled: !!betId && !!user?.id,
    refetchInterval: 10000,
  });

  const withdrawMutation = useMutation({
    mutationFn: (offerId) => base44.functions.invoke('withdrawOffer', { offer_id: offerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers', betId] });
      queryClient.invalidateQueries({ queryKey: ['betsForMatch'] });
    },
  });

  const openOffers = offers.filter(o => o.status === 'open' || o.status === 'partially_matched');

  const getOutcomeColor = (outcome) => {
    if (outcome === 'a') return 'text-primary';
    if (outcome === 'b') return 'text-accent';
    return 'text-yellow-400';
  };

  const getOutcomeBg = (outcome) => {
    if (outcome === 'a') return 'bg-primary/10 border-primary/20';
    if (outcome === 'b') return 'bg-accent/10 border-accent/20';
    return 'bg-yellow-500/10 border-yellow-500/20';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-sm">Open Offers</h3>
        <span className="text-xs text-muted-foreground">{openOffers.length} available</span>
      </div>

      {openOffers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No open offers yet. Be the first to place a bet!
        </p>
      ) : (
        <div className="space-y-2">
          {openOffers.map(offer => {
            const isOwn = offer.created_by_id === user?.id;
            const maxMatcherStake = offer.amount_unmatched * (offer.odds_at_creation - 1);
            const outcomeLabel = offer.outcome === 'a' ? bet?.outcome_a : offer.outcome === 'b' ? bet?.outcome_b : 'Draw';
            const oppositeLabel = offer.outcome === 'a' ? bet?.outcome_b : offer.outcome === 'b' ? bet?.outcome_a : `${bet?.outcome_a} or ${bet?.outcome_b}`;
            
            // Calculate total user stake and potential payout for this specific offer
            const userBetsOnThisOffer = userBets.filter(bet => bet.offer_id === offer.id);
            const totalUserStake = userBetsOnThisOffer.reduce((sum, bet) => sum + (bet.amount || 0), 0);
            const totalUserPotentialPayout = userBetsOnThisOffer.reduce((sum, bet) => sum + (bet.potential_payout || 0), 0);

            return (
              <div
                key={offer.id}
                className={`rounded-xl border p-3 ${getOutcomeBg(offer.outcome)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`font-heading font-bold text-sm ${getOutcomeColor(offer.outcome)}`}>
                        {outcomeLabel}
                      </span>
                      <span className="text-xs font-bold text-foreground bg-secondary px-2 py-0.5 rounded-full">
                        @ {offer.odds_at_creation?.toFixed(2)}x
                      </span>
                      {offer.status === 'partially_matched' && (
                        <Badge className="text-[9px] bg-yellow-500/20 text-yellow-400 py-0">partial</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span>Offered:</span>
                        <span className="font-medium text-foreground">◎{offer.amount_offered?.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Total in Bets:</span>
                        <span className="font-bold text-accent">◎{offer.amount_matched?.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Unmatched:</span>
                        <span className="font-medium text-foreground">◎{offer.amount_unmatched?.toFixed(4)}</span>
                      </div>
                      {!isOwn && totalUserStake > 0 && (
                        <div className="mt-2 pt-2 border-t border-primary/20 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-primary font-medium">Your Bets:</span>
                            <span className="font-bold text-primary">◎{totalUserStake.toFixed(4)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-accent font-medium">You Can Win:</span>
                            <span className="font-bold text-accent">◎{totalUserPotentialPayout.toFixed(4)}</span>
                          </div>
                        </div>
                      )}
                      {!isOwn && totalUserStake === 0 && (
                        <div className="text-accent font-medium mt-1 pt-1 border-t border-accent/20">
                          → Bet up to ◎{maxMatcherStake.toFixed(4)} on {oppositeLabel}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {isOwn ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => withdrawMutation.mutate(offer.id)}
                        disabled={withdrawMutation.isPending}
                      >
                        {withdrawMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        <span className="ml-1">Withdraw</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-lg"
                        onClick={() => onSelectOffer && onSelectOffer(offer)}
                      >
                        Bet Against
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}