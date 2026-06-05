import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Loader2, Zap, TrendingUp, Users, DollarSign } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function Diagnostics() {
  const { user } = useAuth();
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const { data: platformStatus, refetch: refetchPlatform } = useQuery({
    queryKey: ['platformStatus'],
    queryFn: () => base44.functions.invoke('checkPlatformConfig', {}),
  });

  const { data: testResults } = useQuery({
    queryKey: ['platformTest'],
    queryFn: () => base44.functions.invoke('comprehensivePlatformTest', {}),
    enabled: false, // Manual trigger only
  });

  const handleRunTest = async () => {
    setTestRunning(true);
    try {
      const res = await base44.functions.invoke('comprehensivePlatformTest', {});
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ error: err.message });
    } finally {
      setTestRunning(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
            <h2 className="font-heading font-bold text-xl mb-2">Admin Access Required</h2>
            <p className="text-muted-foreground">This diagnostics page is only available to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-3xl">Platform Diagnostics</h1>
            <p className="text-muted-foreground">Real-time health check and troubleshooting</p>
          </div>
          <Button onClick={handleRunTest} disabled={testRunning} className="bg-primary hover:bg-primary/90">
            {testRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Run Full Test
              </>
            )}
          </Button>
        </div>

        {/* Platform Status */}
        <Card className={platformStatus?.data?.initialized ? 'bg-accent/10 border-accent/30' : 'bg-destructive/10 border-destructive/30'}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {platformStatus?.data?.initialized ? (
                  <CheckCircle className="w-8 h-8 text-accent" />
                ) : (
                  <XCircle className="w-8 h-8 text-destructive" />
                )}
                <div>
                  <h3 className="font-heading font-bold text-lg">
                    {platformStatus?.data?.initialized ? 'Platform Initialized ✓' : 'Platform NOT Initialized'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {platformStatus?.data?.initialized 
                      ? `Admin: ${platformStatus.data.admin?.slice(0, 8)}... | Fee: ${platformStatus.data.feePercent / 100}%`
                      : 'Run initPlatformConfig to initialize'}
                  </p>
                </div>
              </div>
              <Badge variant={platformStatus?.data?.initialized ? 'default' : 'destructive'}>
                {platformStatus?.data?.initialized ? 'READY' : 'ACTION REQUIRED'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Markets</p>
                <p className="font-heading font-bold text-2xl">{testResult?.results?.marketCreation?.onChainMarkets || '-'}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Active LP Offers</p>
                <p className="font-heading font-bold text-2xl">{testResult?.results?.lpProvision?.activeOffers || '-'}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-secondary-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Unclaimed Bets</p>
                <p className="font-heading font-bold text-2xl">{testResult?.results?.claims?.unclaimedCount || '-'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test Results */}
        {testResult && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-heading font-bold text-xl">
                {testResult.success ? '✅ All Tests Passed' : '⚠️ Tests Completed with Issues'}
              </h3>
              
              {testResult.results && Object.entries(testResult.results).map(([key, value]) => (
                <div key={key} className="border border-border/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</h4>
                    <Badge variant={value.status === 'PASSED' ? 'default' : 'destructive'}>
                      {value.status}
                    </Badge>
                  </div>
                  <pre className="text-xs text-muted-foreground bg-secondary/50 p-3 rounded overflow-auto max-h-48">
                    {JSON.stringify(value, null, 2)}
                  </pre>
                </div>
              ))}

              {testResult.recommendations?.length > 0 && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                  <h4 className="font-bold text-primary mb-2">💡 Recommendations</h4>
                  <ul className="text-sm space-y-1">
                    {testResult.recommendations.map((rec, i) => (
                      <li key={i} className="text-muted-foreground">• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Admin Actions */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Button variant="outline" onClick={() => window.location.href = '/init-platform'}>
                Initialize Platform
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/admin'}>
                Admin Dashboard
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/lp'}>
                LP Dashboard
              </Button>
              <Button variant="outline" onClick={async () => {
                localStorage.clear();
                window.location.reload();
              }}>
                Clear Cache
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}