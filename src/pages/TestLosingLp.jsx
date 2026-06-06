import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bug, CheckCircle, XCircle, Loader, Wallet } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function TestLosingLp() {
  const [searchParams] = useSearchParams();
  const testUserBetId = searchParams.get('test');
  
  const [loading, setLoading] = useState(true);
  const [testData, setTestData] = useState(null);
  const [error, setError] = useState(null);
  const [pendingTx, setPendingTx] = useState(null);
  const [txResult, setTxResult] = useState(null);

  useEffect(() => {
    if (!testUserBetId) {
      setError('No test UserBet ID provided. Go to /lp dashboard and click "Test Losing LP"');
      setLoading(false);
      return;
    }

    const runTest = async () => {
      try {
        console.log('[TestLosingLp] Running test for UserBet:', testUserBetId);
        const res = await base44.functions.invoke('testLosingLpWithdraw', {
          userBetId: testUserBetId
        });

        if (res.data.error) {
          setError(res.data.error);
        } else {
          setTestData(res.data);
          console.log('[TestLosingLp] Test data:', res.data);
        }
      } catch (err) {
        console.error('[TestLosingLp] Error:', err);
        setError(err.message || 'Failed to run test');
      } finally {
        setLoading(false);
      }
    };

    runTest();
  }, [testUserBetId]);

  const handleTxSuccess = async (txResult) => {
    console.log('[TestLosingLp] Transaction succeeded:', txResult.signature);
    setTxResult({
      success: true,
      signature: txResult.signature,
      message: '⚠️ TRANSACTION SUCCEEDED - This proves the on-chain logic is BUGGY (inverted)!\n\nThe deployed contract has the == check instead of !=, allowing withdrawals from losing LP positions.',
    });
    setPendingTx(null);
  };

  const handleTxError = (err) => {
    console.error('[TestLosingLp] Transaction failed:', err);
    let message = 'Transaction failed';
    
    // Check for error 6009 (ClaimNothing)
    if (err.message?.includes('6009') || err.message?.includes('ClaimNothing')) {
      message = '✅ TRANSACTION FAILED with error 6009 (ClaimNothing)\n\nThis proves the on-chain logic is CORRECT (!= check). The deployed program correctly rejects withdrawals from losing LP positions.';
    } else if (err.message?.includes('Invalid instruction data or discriminator')) {
      message = '❌ Discriminator mismatch - the deployed program uses a different instruction format than expected.';
    }
    
    setTxResult({
      success: false,
      error: err.message,
      message,
    });
    setPendingTx(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground font-heading">Running test...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Bug className="w-6 h-6 text-destructive" />
          <h1 className="font-heading font-bold text-2xl">Losing LP Withdrawal Test</h1>
        </div>

        {error && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
            <XCircle className="w-4 h-4 text-destructive" />
            <AlertDescription className="text-destructive">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {testData && !pendingTx && !txResult && (
          <div className="space-y-4">
            <Alert className="bg-yellow-500/10 border-yellow-500/30">
              <Bug className="w-4 h-4 text-yellow-400" />
              <AlertDescription className="text-yellow-400">
                <strong>Test Purpose:</strong> This attempts to withdraw from a LOSING LP position.
                <ul className="mt-2 list-disc list-inside text-sm space-y-1">
                  <li>If <strong>SUCCESS</strong>: On-chain logic is BUGGY (has == check)</li>
                  <li>If <strong>FAILS with 6009</strong>: On-chain logic is CORRECT (has != check)</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
              <h3 className="font-heading font-bold text-lg">Test Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">UserBet ID</p>
                  <p className="font-mono text-foreground">{testData.userBetId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Offer ID</p>
                  <p className="font-mono text-foreground">{testData.offerId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Withdraw Amount</p>
                  <p className="font-heading font-bold text-accent">◎{testData.solana_instruction?.withdrawAmount?.toFixed(4)} SOL</p>
                </div>
                <div>
                  <p className="text-muted-foreground">LP Outcome</p>
                  <p className="font-heading text-foreground">{testData.solana_instruction?.outcome === 0 ? 'Team A' : testData.solana_instruction?.outcome === 1 ? 'Team B' : 'Draw'}</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setPendingTx(testData.solana_instruction)}
              className="w-full h-12 font-heading font-bold rounded-xl text-base"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
            >
              <Bug className="w-5 h-5 mr-2" />
              Run Test: Attempt Withdrawal
            </Button>
          </div>
        )}

        {pendingTx && (
          <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Sign Transaction</h3>
            <p className="text-sm text-muted-foreground">
              This will attempt to withdraw ◎{testData.solana_instruction?.withdrawAmount?.toFixed(4)} from a LOSING LP position.
            </p>
            <SolanaTransactionSigner
              instruction={pendingTx}
              amount={testData.solana_instruction?.withdrawAmount?.toFixed(4)}
              userBetId={testData.userBetId}
              onSuccess={handleTxSuccess}
              onError={handleTxError}
            />
          </div>
        )}

        {txResult && (
          <Alert className={txResult.success ? 'bg-destructive/10 border-destructive/30' : 'bg-accent/10 border-accent/30'}>
            {txResult.success ? <XCircle className="w-4 h-4 text-destructive" /> : <CheckCircle className="w-4 h-4 text-accent" />}
            <AlertDescription className={txResult.success ? 'text-destructive' : 'text-accent'}>
              <p className="font-heading font-bold text-base mb-2">
                {txResult.success ? '⚠️ TEST RESULT: On-chain logic is BUGGY' : '✅ TEST RESULT: On-chain logic is CORRECT'}
              </p>
              <p className="text-sm whitespace-pre-line">{txResult.message}</p>
              {txResult.signature && (
                <a
                  href={`https://solscan.io/tx/${txResult.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-xs font-bold hover:underline"
                >
                  <Wallet className="w-3 h-3" />
                  View on Solscan
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button
          variant="outline"
          onClick={() => window.location.href = '/lp'}
          className="w-full"
        >
          Back to LP Dashboard
        </Button>
      </div>
    </div>
  );
}