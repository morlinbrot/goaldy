import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addContribution, getContributionForMonth, getSavingsGoal } from "@/lib/database";
import { formatCurrency, type SavingsContribution, type SavingsGoal } from "@/lib/types";
import { ArrowLeft, Check, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Confetti } from "./Confetti";

interface MonthlyCheckInProps {
  goalId: string;
  onComplete: () => void;
  onBack: () => void;
}

type CheckInStep = 'question' | 'partial' | 'celebration' | 'encouragement';

// Get current month for the check-in
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonthName(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long' });
}

export function MonthlyCheckIn({ goalId, onComplete, onBack }: MonthlyCheckInProps) {
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [existingContribution, setExistingContribution] = useState<SavingsContribution | null>(null);
  const [step, setStep] = useState<CheckInStep | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadGoal = useCallback(async () => {
    try {
      const currentMonth = getCurrentMonth();
      const [goalData, existingContrib] = await Promise.all([
        getSavingsGoal(goalId),
        getContributionForMonth(goalId, currentMonth),
      ]);
      setGoal(goalData);
      setExistingContribution(existingContrib);

      // If there's an existing contribution, go straight to the input field
      if (existingContrib) {
        setStep('partial');
      } else {
        setStep('question');
      }
    } catch (error) {
      console.error('Failed to load goal:', error);
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  // Focus the input when entering partial step
  useEffect(() => {
    if (step === 'partial' && inputRef.current) {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  const handleFullAmount = async () => {
    if (!goal) return;
    setIsSaving(true);
    try {
      await addContribution(goalId, getCurrentMonth(), goal.monthly_contribution, true);
      setShowConfetti(true);
      setStep('celebration');
    } catch (error) {
      console.error('Failed to save contribution:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePartialAmount = async () => {
    if (!goal) return;
    const amount = parseFloat(partialAmount);
    if (isNaN(amount) || amount < 0) return;

    setIsSaving(true);
    try {
      await addContribution(goalId, getCurrentMonth(), amount, false);
      if (amount > 0) {
        setShowConfetti(true);
        setStep('celebration');
      } else {
        setStep('encouragement');
      }
    } catch (error) {
      console.error('Failed to save contribution:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotThisMonth = async () => {
    if (!goal) return;
    setIsSaving(true);
    try {
      await addContribution(goalId, getCurrentMonth(), 0, false);
      setStep('encouragement');
    } catch (error) {
      console.error('Failed to save contribution:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !step) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Goal not found</p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const isUpdating = !!existingContribution;

  const renderContent = () => {
    switch (step) {
      case 'question':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>

            <h2 className="text-2xl font-bold mb-2">Monthly Check-in</h2>
            <p className="text-muted-foreground mb-8">
              How much did you save for <span className="font-medium text-foreground">{goal.name}</span> in {getCurrentMonthName()}?
            </p>

            <div className="w-full max-w-sm space-y-3">
              <Button
                className="w-full h-14 text-lg"
                onClick={handleFullAmount}
                disabled={isSaving}
              >
                <Check className="w-5 h-5 mr-2" />
                Yes, full amount ({formatCurrency(goal.monthly_contribution)})
              </Button>

              <Button
                variant="outline"
                className="w-full h-14 text-lg"
                onClick={() => setStep('partial')}
                disabled={isSaving}
              >
                Yes, but a different amount
              </Button>

              <Button
                variant="ghost"
                className="w-full h-14 text-lg text-muted-foreground"
                onClick={handleNotThisMonth}
                disabled={isSaving}
              >
                <X className="w-5 h-5 mr-2" />
                Not this month
              </Button>
            </div>
          </div>
        );

      case 'partial':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">
              {isUpdating ? 'Update your savings' : 'How much did you save?'}
            </h2>
            <p className="text-muted-foreground mb-8">
              {isUpdating
                ? `Previously recorded: ${formatCurrency(existingContribution.amount)}`
                : 'Every bit counts toward your goal!'}
            </p>

            <div className="w-full max-w-sm space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">
                  €
                </span>
                <Input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder={isUpdating ? existingContribution.amount.toString() : '0'}
                  className="pl-12 text-2xl h-14 text-center"
                  disabled={isSaving}
                />
              </div>

              <Button
                className="w-full h-14 text-lg"
                onClick={handlePartialAmount}
                disabled={isSaving || !partialAmount}
              >
                {isSaving ? 'Saving...' : isUpdating ? 'Update' : 'Save'}
              </Button>

              {!isUpdating && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep('question')}
                  disabled={isSaving}
                >
                  Back
                </Button>
              )}

              {isUpdating && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={onBack}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        );

      case 'celebration':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {showConfetti && <Confetti />}

            <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mb-6 animate-bounce">
              <Check className="w-12 h-12 text-green-500" />
            </div>

            <h2 className="text-3xl font-bold mb-2">
              {isUpdating ? 'Updated!' : 'Amazing!'}
            </h2>
            <p className="text-xl text-muted-foreground mb-4">
              {isUpdating ? 'Your savings have been updated' : "You're building great habits"}
            </p>

            {goal.why_statement && (
              <Card className="w-full max-w-sm bg-primary/5 border-primary/20 mb-8">
                <CardContent className="p-4">
                  <p className="text-xs text-primary font-medium mb-1">REMEMBER WHY</p>
                  <p className="text-sm italic">"{goal.why_statement}"</p>
                </CardContent>
              </Card>
            )}

            <Button
              className="w-full max-w-sm h-14 text-lg"
              onClick={onComplete}
            >
              Continue
            </Button>
          </div>
        );

      case 'encouragement':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-blue-500" />
            </div>

            <h2 className="text-2xl font-bold mb-2">That's okay!</h2>
            <p className="text-muted-foreground mb-4">
              Every journey has ups and downs. What matters is that you keep going.
            </p>

            {goal.why_statement && (
              <Card className="w-full max-w-sm bg-primary/5 border-primary/20 mb-8">
                <CardContent className="p-4">
                  <p className="text-xs text-primary font-medium mb-1">REMEMBER WHY</p>
                  <p className="text-sm italic">"{goal.why_statement}"</p>
                </CardContent>
              </Card>
            )}

            <p className="text-sm text-muted-foreground mb-8">
              Tomorrow is a new opportunity. You've got this!
            </p>

            <Button
              className="w-full max-w-sm h-14 text-lg"
              onClick={onComplete}
            >
              Continue
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      {step !== 'celebration' && step !== 'encouragement' && (
        <header className="flex items-center gap-3 p-4 border-b">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">{goal.name}</h1>
        </header>
      )}

      {renderContent()}
    </div>
  );
}
