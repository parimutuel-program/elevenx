import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Copy, ExternalLink } from 'lucide-react';

export default function DebugProgramId() {
  const [copied, setCopied] = useState(false);

  const { data: secretData } = useQuery({
    queryKey: ['debugSecrets'],
    queryFn: () => base44.functions.invoke('debugSecrets', {}),
  });

  const { data: programData } = useQuery({
    queryKey: ['checkProgramOnChain'],
    queryFn: () => base44.functions.invoke('checkProgramOnChain', {}),
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="font-heading font-bold text-2xl">Program ID Diagnostics</h1>

        {/* Secret Status */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <h2 className="font-heading font-bold text-lg mb-4">1. Environment Secret</h2>
            {secretData?.present ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-accent">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-bold text-accent">SOLANA_PROGRAM_ID is set</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs break-all">
                  <p className="text-muted-foreground mb-1">Secret value:</p>
                  <div className="flex items-center justify-between gap-2">
                    <span>{secretData.value}</span>
                    <button onClick={() => copyToClipboard(secretData.value)} className="hover:text-primary">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-bold text-destructive">Secret NOT set</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* On-Chain Program Status */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6">
            <h2 className="font-heading font-bold text-lg mb-4">2. On-Chain Program</h2>
            {programData?.exists ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-accent">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-bold text-accent">Program exists on Devnet</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Program ID:</span>
                    <span className="font-mono text-xs">{programData.programId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Executable:</span>
                    <span className="text-xs">{programData.executable ? '✅ Yes' : '❌ No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Data Length:</span>
                    <span className="text-xs">{programData.dataLength} bytes</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Owner:</span>
                    <span className="text-xs font-mono">{programData.owner}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-bold text-destructive">Program NOT found on Devnet</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comparison */}
        {secretData?.present && programData?.exists && (
          <Card className={secretData.value === programData.programId ? 'bg-accent/10 border-accent/30' : 'bg-destructive/10 border-destructive/30'}>
            <CardContent className="p-6">
              <h2 className="font-heading font-bold text-lg mb-4">3. Comparison</h2>
              {secretData.value === programData.programId ? (
                <div className="flex items-center gap-2 text-accent">
                  <CheckCircle className="w-6 h-6" />
                  <div>
                    <p className="font-bold text-accent">✅ Program IDs Match!</p>
                    <p className="text-sm text-muted-foreground">Your secret matches the deployed program</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-6 h-6" />
                    <p className="font-bold text-destructive">❌ Program IDs DO NOT Match!</p>
                  </div>
                  <div className="bg-destructive/20 rounded-lg p-3 space-y-2 text-sm">
                    <p><strong>Secret:</strong> {secretData.value}</p>
                    <p><strong>On-Chain:</strong> {programData.programId}</p>
                  </div>
                  <div className="text-destructive text-xs">
                    <p className="font-bold mb-2">Fix:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to Base44 Dashboard → Code → Secrets</li>
                      <li>Update SOLANA_PROGRAM_ID to: <span className="font-mono">{programData.programId}</span></li>
                      <li>Save and reload this page</li>
                    </ol>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open('https://solscan.io/program/' + (programData?.programId || ''), '_blank')}
            disabled={!programData?.exists}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View Program on Solscan
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </Button>
        </div>
      </div>
    </div>
  );
}