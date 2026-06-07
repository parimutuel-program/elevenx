import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UpdateSecret() {
  const [programId, setProgramId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const handleUpdate = async () => {
    if (!programId.trim()) {
      toast.error('Please enter a program ID');
      return;
    }

    setIsLoading(true);
    try {
      await base44.functions.invoke('updateSecret', {
        secretName: 'SOLANA_PROGRAM_ID',
        secretValue: programId.trim(),
      });
      toast.success('✓ Secret updated! Refresh the page to apply.');
      setCurrentId(programId.trim());
    } catch (err) {
      toast.error('Failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheck = async () => {
    try {
      const res = await base44.functions.invoke('solanaConfig', {});
      setCurrentId(res.data.currentProgramId);
      toast.success('Current ID loaded');
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading font-bold text-3xl text-white mb-2">Update Solana Program ID</h1>
          <p className="text-sm text-gray-400">Enter your deployed program ID to update the secret</p>
        </div>

        <Card className="bg-gray-900 border border-gray-800 p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Current Program ID</label>
            <div className="flex gap-2">
              <Input
                value={currentId || ''}
                readOnly
                className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
                placeholder="Click 'Check Current' to load"
              />
              <Button onClick={handleCheck} variant="outline" className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700">
                Check Current
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-800">
            <label className="text-sm text-gray-400 mb-2 block">New Program ID</label>
            <Input
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
              placeholder="e.g. 93ckWZk8mwdEK5aXdzFdw43866AwBuqDTehVTEjgwQkK"
            />
            <p className="text-xs text-gray-500 mt-2">
              Paste your deployed program ID from Solana
            </p>
          </div>

          <Button
            onClick={handleUpdate}
            disabled={isLoading || !programId.trim()}
            className="w-full h-12 font-heading font-bold rounded-xl"
            style={{ background: 'linear-gradient(135deg, #a69cf2, #8b84e8)' }}
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Secret'
            )}
          </Button>

          <div className="bg-yellow-600/20 border border-yellow-600/30 rounded-xl p-4">
            <p className="text-xs text-yellow-400">
              ⚠️ After updating, you may need to refresh the app preview or wait a few moments for the change to propagate.
            </p>
          </div>
        </Card>

        {currentId && (
          <Card className="bg-gray-900 border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              {currentId === '93ckWZk8mwdEK5aXdzFdw43866AwBuqDTehVTEjgwQkK' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <p className="text-sm text-green-400">✓ Correct program ID is set!</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <p className="text-sm text-yellow-400">Still showing old ID - may need platform cache refresh</p>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}