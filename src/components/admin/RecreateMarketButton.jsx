import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader, RefreshCcw, CheckCircle, AlertCircle } from 'lucide-react';
import SolanaTransactionSigner from '@/components/wallet/SolanaTransactionSigner';

export default function RecreateMarketButton({ bet, match_id, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState([]);
  const [instruction, setInstruction] = useState(null);
  const [showSigner, setShowSigner] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleRecreate = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await base44.functions.invoke('recreateMarketWithValidDates', {
        bet_id: bet.id,
        match_id,
      });

      if (response.data.error) {
        setError(response.data.error);
        return;
      }

      if (response.data.steps && response.data.steps.length > 0) {
        // 2-step flow: create market + update timestamps
        setSteps(response.data.steps);
        setCurrentStep(0);
        setInstruction({
          ...response.data.steps[0].solana_instruction,
          amount: 0,
        });
        setShowSigner(true);
      } else if (response.data.solana_instruction) {
        // Legacy single-step flow
        setInstruction({
          ...response.data.solana_instruction,
          amount: 0,
        });
        setShowSigner(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepComplete = async () => {
    if (currentStep < steps.length - 1) {
      // Move to next step
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setInstruction({
        ...steps[nextStep].solana_instruction,
        amount: 0,
      });
    } else {
      // All steps complete
      setIsSuccess(true);
      setShowSigner(false);
      onSuccess?.();
    }
  };

  const handleTransactionSuccess = async ({ signature }) => {
    console.log('Transaction confirmed:', signature);
    
    // Wait for Solana propagation
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (steps.length > 0 && currentStep < steps.length - 1) {
      // More steps to complete
      handleStepComplete();
    } else {
      // All steps complete
      setIsSuccess(true);
      setShowSigner(false);
      setInstruction(null);
      
      // Refresh market status
      try {
        const status = await base44.functions.invoke('checkMarketStatus', { match_id });
        console.log('Market status after recreation:', status.data);
        onSuccess?.(status.data);
      } catch (err) {
        console.error('Failed to check market status:', err);
      }
    }
  };

  if (isSuccess) {
    return (
      <Alert className="border-accent/50 bg-accent/10">
        <CheckCircle className="w-4 h-4 text-accent" />
        <AlertDescription className="text-sm text-accent font-medium">
          ✓ Market ready! Timestamps updated - you can now settle immediately.
        </AlertDescription>
      </Alert>
    );
  }

  if (showSigner && instruction) {
    const stepInfo = steps.length > 0 ? `Step ${currentStep + 1} of ${steps.length}` : '';
    const stepLabel = steps.length > 0 ? steps[currentStep].label : '';
    
    return (
      <div className="space-y-3">
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          <AlertDescription className="text-sm text-yellow-500">
            {stepInfo && <span className="font-bold">{stepInfo}: </span>}
            {stepLabel || 'Sign transaction to continue'}
          </AlertDescription>
        </Alert>
        <SolanaTransactionSigner
          instruction={instruction}
          amount={0}
          onSuccess={handleTransactionSuccess}
          onError={(err) => setError(err.message)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        onClick={handleRecreate}
        disabled={isLoading}
        className="w-full"
        variant="destructive"
      >
        {isLoading ? (
          <>
            <Loader className="w-4 h-4 mr-2 animate-spin" />
            Preparing...
          </>
        ) : (
          <>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Recreate Market (Fix Error 6004)
          </>
        )}
      </Button>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}