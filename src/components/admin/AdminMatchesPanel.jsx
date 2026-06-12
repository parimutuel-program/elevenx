import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CheckCircle, Loader, Rocket, RefreshCcw, Trophy, AlertCircle } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function AdminMatchesPanel({ walletAddress }) {
  const queryClient = useQueryClient();
  const [pendingDeploy, setPendingDeploy] = useState(null);
  const [deployingMatchId, setDeployingMatchId] = useState(null);
  const [fixingTimestampsId, setFixingTimestampsId] = useState(null);
  const [pendingTimestampFix, setPendingTimestampFix] = useState(null);
  const [deployAllDialog, setDeployAllDialog] = useState(null); // { instruction, remaining, betId, total }

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['adminMatches'],
    queryFn: () => base44.entities.Match.list('-created_date', 100),
  });

  const { data: bets = [] } = useQuery({
    queryKey: ['allBetsForMatches'],
    queryFn: () => base44.entities.Bet.list(),
  });

  const getBetForMatch = (matchId) => {
    return bets.find(b => b.match_id === matchId);
  };

  const deployMutation = useMutation({
    mutationFn: async (matchId) => {
      const bet = getBetForMatch(matchId);
      if (!bet) {
        throw new Error('No bet found for this match');
      }
      
      console.log('[AdminMatchesPanel] Deploying match:', matchId, 'bet_id:', bet.id);
      
      const res = await base44.functions.invoke('createMarketOnChain', {
        bet_id: bet.id,
        match_id: matchId,
        force_recreate: true,
      });
      
      console.log('[AdminMatchesPanel] Response:', res.data);
      
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data, matchId) => {
      console.log('[AdminMatchesPanel] onSuccess called:', data);
      
      if (data.alreadyExists && !data.forceRecreated) {
        alert('Market already exists on-chain!');
        queryClient.invalidateQueries({ queryKey: ['adminMatches'] });
        return;
      }
      
      if (data.solana_instruction) {
        console.log('[AdminMatchesPanel] Setting pending deploy:', data.solana_instruction);
        setPendingDeploy({
          ...data.solana_instruction,
          match_id: matchId,
          bet_id: data.bet_id,
        });
      } else {
        alert('No instruction returned - check console for details');
      }
    },
    onError: (error) => {
      console.error('[AdminMatchesPanel] Deploy error:', error);
      alert('Deploy failed: ' + error.message);
    },
  });

  const fixTimestampsMutation = useMutation({
    mutationFn: async (matchId) => {
      const bet = getBetForMatch(matchId);
      if (!bet) {
        throw new Error('No bet found for this match');
      }
      
      const res = await base44.functions.invoke('updateMarketTimestampsOnChain', {
        bet_id: bet.id,
      });
      
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data, matchId) => {
      if (data.solana_instruction) {
        setPendingTimestampFix({
          ...data.solana_instruction,
          match_id: matchId,
          bet_id: data.bet_id,
        });
      }
    },
  });

  const handleDeploySuccess = async (result) => {
    if (pendingDeploy?.bet_id) {
      const marketPda = result.marketPda || pendingDeploy.marketPda || pendingDeploy.accounts?.market;
      try {
        await base44.functions.invoke('commitMarketDeployment', {
          bet_id: pendingDeploy.bet_id,
          market_pda: marketPda,
        });
      } catch (e) {
        console.error('[AdminMatchesPanel] commitMarketDeployment failed:', e);
      }
    }
    
    setPendingDeploy(null);
    setDeployingMatchId(null);
    queryClient.invalidateQueries({ queryKey: ['adminMatches'] });
    queryClient.invalidateQueries({ queryKey: ['allBetsForMatches'] });
    alert('✓ Market deployed on-chain!');
  };

  const handleTimestampFixSuccess = async () => {
    setPendingTimestampFix(null);
    queryClient.invalidateQueries({ queryKey: ['adminMatches'] });
    queryClient.invalidateQueries({ queryKey: ['allBetsForMatches'] });
    alert('✓ Market timestamps fixed!');
  };

  const handleDeployAllSuccess = async (commitPayload) => {
    // Commit DB update AFTER on-chain confirmation
    if (commitPayload?.signature && deployAllDialog?.betId) {
      try {
        await base44.functions.invoke('commitMarketDeployment', {
          bet_id: deployAllDialog.betId,
          market_pda: commitPayload.marketPda || deployAllDialog.instruction?.accounts?.market,
        });
        console.log('[AdminMatchesPanel] ✓ Committed deployment to DB:', deployAllDialog.betId);
      } catch (e) {
        console.error('[AdminMatchesPanel] commitMarketDeployment failed:', e);
      }
    }
    
    try {
      const res = await base44.functions.invoke('deployAllMatches');
      if (res.data.needsSigning) {
        setDeployAllDialog({
          instruction: res.data.solana_instruction,
          remaining: res.data.remaining,
          betId: res.data.bet_id,
        });
      } else if (res.data.autoContinue) {
        // Small delay to avoid rate limits
        setTimeout(() => handleDeployAllSuccess(), 2000);
      } else {
        setDeployAllDialog(null);
        alert(res.data.message || '✓ All matches deployed!');
        queryClient.invalidateQueries({ queryKey: ['adminMatches'] });
        queryClient.invalidateQueries({ queryKey: ['allBetsForMatches'] });
      }
    } catch (err) {
      alert('Error: ' + err.message);
      setDeployAllDialog(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-900 border border-gray-800 p-12">
        <div className="flex items-center justify-center">
          <Loader className="w-6 h-6 animate-spin text-purple-500 mr-2" />
          <span className="text-gray-400">Loading matches...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900 border border-gray-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-sm font-bold text-white">Match Markets</p>
              <p className="text-xs text-gray-400">Deploy matches to Solana for on-chain betting</p>
            </div>
          </div>
          <Badge className="bg-purple-600 text-white font-bold">
            {matches.length} Matches
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Deploy All On-Chain Button */}
          <Button
            onClick={async () => {
              try {
                const res = await base44.functions.invoke('deployAllMatches');
                if (res.data.needsSigning) {
                  const total = res.data.remaining + 1;
                  setDeployAllDialog({
                    instruction: res.data.solana_instruction,
                    remaining: res.data.remaining,
                    betId: res.data.bet_id,
                    total,
                  });
                } else {
                  alert(res.data.message || '✓ All matches deployed!');
                  queryClient.invalidateQueries({ queryKey: ['adminMatches'] });
                }
              } catch (err) {
                alert('Error: ' + err.message);
              }
            }}
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold h-12 rounded-xl gap-2 text-sm shadow-lg shadow-purple-900/30"
          >
            <Rocket className="w-5 h-5" />
            Deploy All Matches
          </Button>
          
          {/* Sync Deployment Status Button */}
          <Button
            onClick={async () => {
              try {
                const res = await base44.functions.invoke('syncMarketDeployment');
                if (res.data.success) {
                  alert(`✓ Sync Complete!\n\nUpdated: ${res.data.updated}\nAlready Deployed: ${res.data.alreadyDeployed}\nNot Found: ${res.data.notFound}`);
                  queryClient.invalidateQueries({ queryKey: ['adminMatches'] });
                  queryClient.invalidateQueries({ queryKey: ['allBetsForMatches'] });
                } else {
                  alert('Error: ' + (res.data.error || 'Unknown error'));
                }
              } catch (err) {
                alert('Error: ' + err.message);
              }
            }}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 text-white font-bold h-12 rounded-xl gap-2 text-sm"
          >
            <CheckCircle className="w-5 h-5" />
            Sync Deployment Status
          </Button>
        </div>
      </Card>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {matches.map((match) => {
          const bet = getBetForMatch(match.id);
          const isDeployed = bet?.solana_market_created;
          
          return (
            <Card key={match.id} className="bg-gray-900 border border-gray-800 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-emerald-500/10 border border-purple-500/30 flex items-center justify-center text-2xl">
                    {match.team_a_flag || '🏆'}
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-white">{match.team_a} vs {match.team_b}</h3>
                    <p className="text-xs text-gray-400">{match.group_stage || 'Friendly'}</p>
                    <p className="text-xs text-gray-500">{new Date(match.match_time).toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {isDeployed ? (
                    <>
                      <Badge className="bg-emerald-600/20 text-emerald-400 text-xs py-1 px-3 rounded-lg border border-emerald-600/30">
                        <CheckCircle className="w-3 h-3 mr-1" /> On-Chain
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => {
                          setFixingTimestampsId(match.id);
                          fixTimestampsMutation.mutate(match.id);
                        }}
                        disabled={fixTimestampsMutation.isPending || fixingTimestampsId === match.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-7 px-3 rounded-lg"
                      >
                        {fixingTimestampsId === match.id && fixTimestampsMutation.isPending ? (
                          <Loader className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <RefreshCcw className="w-3 h-3 mr-1" /> Fix Times
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge className="bg-gray-700 text-gray-300 text-xs py-1 px-3 rounded-lg">
                        Not Deployed
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => {
                          console.log('[AdminMatchesPanel] Deploy button clicked for match:', match.id);
                          setDeployingMatchId(match.id);
                          deployMutation.mutate(match.id);
                        }}
                        disabled={deployMutation.isPending || deployingMatchId === match.id || !bet}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-7 px-3 rounded-lg"
                      >
                        {deployingMatchId === match.id && deployMutation.isPending ? (
                          <>
                            <Loader className="w-3 h-3 animate-spin" />
                            Deploying...
                          </>
                        ) : (
                          <>
                            <Rocket className="w-3 h-3 mr-1" /> Deploy
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {bet && (
                <div className="bg-gray-800/50 rounded-lg p-3 mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Status:</span>
                    <Badge className={bet.status === 'open' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-gray-700 text-gray-300'}>
                      {bet.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="text-gray-400">Total Pool:</span>
                    <span className="text-white font-bold">{bet.total_pool?.toFixed(2) || 0} SOL</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="text-gray-400">Bettors:</span>
                    <span className="text-white font-bold">{bet.total_bettors || 0}</span>
                  </div>
                </div>
              )}

              {!bet && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mt-3">
                  <p className="text-xs text-red-400">⚠️ No bet created for this match yet</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {matches.length === 0 && (
        <Card className="bg-gray-900 border border-gray-800 p-12">
          <div className="text-center">
            <Trophy className="w-12 h-12 text-purple-500 mx-auto mb-4" />
            <h3 className="font-heading font-bold text-lg text-white mb-2">No Matches Yet</h3>
            <p className="text-gray-400 text-sm mb-4">
              Use "Sync World Cup" or "Create Quick Test" to add matches
            </p>
          </div>
        </Card>
      )}

      {pendingDeploy && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="bg-gray-900 border border-gray-800 p-6 max-w-md w-full">
            <div className="space-y-4">
              <div className="bg-purple-600/20 border border-purple-600/30 rounded-xl p-4">
                <p className="text-sm font-bold text-purple-400 mb-1">Deploy Market to Solana</p>
                <p className="text-xs text-gray-400">Sign transaction to deploy this match market on-chain</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingDeploy}
                amount={0}
                betId={pendingDeploy.bet_id}
                onSuccess={handleDeploySuccess}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPendingDeploy(null)} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {pendingTimestampFix && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="bg-gray-900 border border-gray-800 p-6 max-w-md w-full">
            <div className="space-y-4">
              <div className="bg-emerald-600/20 border border-emerald-600/30 rounded-xl p-4">
                <p className="text-sm font-bold text-emerald-400 mb-1">Fix Market Timestamps</p>
                <p className="text-xs text-gray-400">Update on-chain market timestamps (for testing)</p>
              </div>
              <SolanaTransactionSigner
                instruction={pendingTimestampFix}
                amount={0}
                betId={pendingTimestampFix.bet_id}
                onSuccess={handleTimestampFixSuccess}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPendingTimestampFix(null)} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {deployAllDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="bg-gray-900 border border-gray-800 p-6 max-w-lg w-full">
            <div className="space-y-4">
              <div className="bg-purple-600/20 border border-purple-600/30 rounded-xl p-4">
                <h3 className="font-heading font-bold text-lg text-purple-400 mb-1">Deploy Match {deployAllDialog.total - deployAllDialog.remaining} of {deployAllDialog.total}</h3>
                <p className="text-sm text-gray-400">Sign each transaction to deploy matches one at a time. Remaining: {deployAllDialog.remaining}</p>
              </div>
              <SolanaTransactionSigner
                instruction={deployAllDialog.instruction}
                amount="0"
                betId={deployAllDialog.betId}
                onSuccess={async (commitPayload) => {
                  // Commit DB update AFTER on-chain confirmation
                  if (commitPayload?.signature && deployAllDialog.betId) {
                    try {
                      await base44.functions.invoke('commitMarketDeployment', {
                        bet_id: deployAllDialog.betId,
                        market_pda: commitPayload.marketPda || deployAllDialog.instruction?.accounts?.market,
                      });
                    } catch (e) {
                      console.error('[AdminMatchesPanel] commitMarketDeployment failed:', e);
                    }
                  }
                  // Continue to next match
                  handleDeployAllSuccess();
                }}
                onError={(err) => {
                  alert('Failed: ' + err.message);
                  setDeployAllDialog(null);
                }}
              />
              <Button
                onClick={() => setDeployAllDialog(null)}
                variant="outline"
                className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}