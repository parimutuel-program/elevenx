import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { useWallet } from '@/lib/WalletContext';

export default function DebugClaim() {
  const { walletAddress } = useWallet();
  const [userBetId, setUserBetId] = useState('');
  const [debugResult, setDebugResult] = useState(null);
  const [error, setError] = useState(null);

  const debugMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('debugClaim', {
        userBetId: userBetId || undefined,
        walletAddress
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      setDebugResult(data);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      setDebugResult(null);
    }
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-heading font-bold">🔍 Claim Debug Tool</h1>
        
        <Card className="bg-card border-border/50">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Wallet Address</label>
              <div className="p-3 bg-secondary/20 rounded-lg font-mono text-xs break-all">
                {walletAddress || 'Not connected'}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">UserBet ID (optional)</label>
              <Input
                value={userBetId}
                onChange={(e) => setUserBetId(e.target.value)}
                placeholder="Leave empty to check all bets"
                className="bg-secondary/10"
              />
            </div>

            <Button
              onClick={() => debugMutation.mutate()}
              disabled={debugMutation.isPending}
              className="w-full h-10"
            >
              {debugMutation.isPending ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Running Diagnostics...
                </>
              ) : (
                'Run Claim Diagnostics'
              )}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="w-6 h-6" />
                <div>
                  <h3 className="font-bold">Error</h3>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {debugResult && (
          <div className="space-y-4">
            <Card className="bg-accent/10 border-accent/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 text-accent mb-4">
                  <CheckCircle className="w-6 h-6" />
                  <h3 className="font-bold text-lg">Diagnostics Complete</h3>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground">Platform Exists</p>
                      <p className="font-bold">{debugResult.platformExists ? '✅ Yes' : '❌ No'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fee Vault Exists</p>
                      <p className="font-bold">{debugResult.feeVaultExists ? '✅ Yes' : '❌ No'}</p>
                    </div>
                  </div>

                  {debugResult.userBets && (
                    <div>
                      <p className="text-muted-foreground mb-2">Your Bets ({debugResult.userBets.length})</p>
                      <div className="space-y-2">
                        {debugResult.userBets.map((bet) => (
                          <div key={bet.id} className="p-3 bg-secondary/10 rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="font-mono text-xs">{bet.id}</span>
                              <span className={`text-xs font-bold ${bet.status === 'won' ? 'text-accent' : 'text-muted-foreground'}`}>
                                {bet.status}
                              </span>
                            </div>
                            <p className="text-xs mt-1">
                              Outcome: {bet.outcome} | Amount: ◎{bet.amount?.toFixed(4)} | Payout: ◎{bet.potential_payout?.toFixed(4)}
                            </p>
                            {bet.onChain && (
                              <p className="text-xs text-accent mt-1">
                                ✅ Position on-chain | Claimed: {bet.onChain.claimed ? 'Yes' : 'No'} | Claimable: ◎{Number(bet.onChain.claimable || bet.onChain.potential_payout)?.toFixed(4)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugResult.markets && (
                    <div>
                      <p className="text-muted-foreground mb-2">Markets Status</p>
                      <div className="space-y-2">
                        {debugResult.markets.map((market) => (
                          <div key={market.id} className="p-3 bg-secondary/10 rounded-lg">
                            <p className="text-xs font-bold">{market.title}</p>
                            <p className="text-xs mt-1">
                              Status: {market.status} | Winner: {market.winning_outcome || 'Not set'}
                            </p>
                            {market.onChain && (
                              <p className="text-xs mt-1">
                                ✅ Market on-chain | Settled: {market.onChain.settled ? 'Yes' : 'No'} | Lamports: {market.onChain.lamports}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugResult.claimableBets && debugResult.claimableBets.length > 0 && (
                    <div className="p-4 bg-accent/20 border border-accent/30 rounded-lg">
                      <p className="font-bold text-accent mb-2">✅ {debugResult.claimableBets.length} Bet(s) Ready to Claim!</p>
                      <p className="text-xs">
                        Total claimable: ◎{debugResult.totalClaimable?.toFixed(4)} SOL
                      </p>
                    </div>
                  )}

                  {debugResult.blockingIssues && debugResult.blockingIssues.length > 0 && (
                    <div className="p-4 bg-destructive/20 border border-destructive/30 rounded-lg">
                      <p className="font-bold text-destructive mb-2">❌ Blocking Issues:</p>
                      <ul className="text-xs space-y-1">
                        {debugResult.blockingIssues.map((issue, i) => (
                          <li key={i}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}