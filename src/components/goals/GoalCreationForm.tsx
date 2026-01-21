import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createSavingsGoal } from "@/lib/database";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface GoalCreationFormProps {
  onGoalCreated: () => void;
  onBack: () => void;
}

// Get default date (one year from now)
function getDefaultTargetDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date;
}

// Get minimum date (one month from now)
function getMinDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date;
}

export function GoalCreationForm({ onGoalCreated, onBack }: GoalCreationFormProps) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState<Date>(getDefaultTargetDate());
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [contributionTouched, setContributionTouched] = useState(false);
  const [whyStatement, setWhyStatement] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMismatchWarning, setShowMismatchWarning] = useState(false);

  // Calculate required monthly contribution to meet target
  const calculateRequiredContribution = (): number | null => {
    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0 || !targetDate) return null;

    const now = new Date();
    const monthsRemaining = Math.max(1,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth())
    );

    return Math.ceil(amount / monthsRemaining);
  };

  const requiredContribution = calculateRequiredContribution();

  // Auto-fill contribution when amount or date changes (only if not touched)
  useEffect(() => {
    if (!contributionTouched && requiredContribution) {
      setMonthlyContribution(requiredContribution.toString());
    }
  }, [targetAmount, targetDate, contributionTouched, requiredContribution]);

  // Check for mismatch between values
  useEffect(() => {
    if (!contributionTouched) {
      setShowMismatchWarning(false);
      return;
    }

    const amount = parseFloat(targetAmount);
    const contribution = parseFloat(monthlyContribution);

    if (isNaN(amount) || isNaN(contribution) || amount <= 0 || contribution <= 0 || !targetDate) {
      setShowMismatchWarning(false);
      return;
    }

    const now = new Date();
    const monthsRemaining = Math.max(1,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth())
    );

    const totalWithContribution = contribution * monthsRemaining;
    // Show warning if there's more than 1% difference
    const percentDiff = Math.abs(totalWithContribution - amount) / amount;
    setShowMismatchWarning(percentDiff > 0.01);
  }, [targetAmount, targetDate, monthlyContribution, contributionTouched]);

  const handleContributionChange = (value: string) => {
    setMonthlyContribution(value);
    setContributionTouched(true);
  };

  const handleUpdateTarget = () => {
    const contribution = parseFloat(monthlyContribution);
    if (isNaN(contribution) || contribution <= 0 || !targetDate) return;

    const now = new Date();
    const monthsRemaining = Math.max(1,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth())
    );

    const newTarget = Math.round(contribution * monthsRemaining);
    setTargetAmount(newTarget.toString());
    setShowMismatchWarning(false);
  };

  const handleUpdateContribution = () => {
    if (requiredContribution) {
      setMonthlyContribution(requiredContribution.toString());
      setShowMismatchWarning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!name.trim()) {
      setError('Please enter a goal name');
      return;
    }

    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid target amount');
      return;
    }

    if (!targetDate) {
      setError('Please select a target date');
      return;
    }

    if (targetDate <= new Date()) {
      setError('Target date must be in the future');
      return;
    }

    const contribution = parseFloat(monthlyContribution);
    if (isNaN(contribution) || contribution <= 0) {
      setError('Please enter a valid monthly contribution');
      return;
    }

    setIsSubmitting(true);
    try {
      await createSavingsGoal(
        name.trim(),
        amount,
        targetDate.toISOString().split('T')[0],
        contribution,
        whyStatement.trim() || undefined
      );
      onGoalCreated();
    } catch (err) {
      console.error('Failed to create goal:', err);
      setError('Failed to create goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const minDate = getMinDate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <AppHeader title="New Savings Goal" onBack={onBack} />

      {/* Form */}
      <div className="flex-1 overflow-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>What are you saving for?</CardTitle>
            <CardDescription>
              Set a clear goal and track your progress toward achieving it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Goal Name */}
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Goal Name
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Dream House, Vacation, Emergency Fund"
                  disabled={isSubmitting}
                />
              </div>

              {/* Target Amount */}
              <div className="space-y-2">
                <label htmlFor="targetAmount" className="text-sm font-medium">
                  Target Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    €
                  </span>
                  <Input
                    id="targetAmount"
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="1"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="25,000"
                    className="pl-8"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Target Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Target Date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !targetDate && "text-muted-foreground"
                      )}
                      disabled={isSubmitting}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {targetDate ? format(targetDate, "MMMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={targetDate}
                      onSelect={(date) => date && setTargetDate(date)}
                      disabled={(date) => date < minDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Monthly Contribution */}
              <div className="space-y-2">
                <label htmlFor="monthlyContribution" className="text-sm font-medium">
                  Monthly Contribution
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    €
                  </span>
                  <Input
                    id="monthlyContribution"
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="1"
                    value={monthlyContribution}
                    onChange={(e) => handleContributionChange(e.target.value)}
                    placeholder="500"
                    className="pl-8"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Mismatch Warning */}
              {showMismatchWarning && (
                <Card className="border-yellow-500/50 bg-yellow-500/10">
                  <CardContent className="p-4">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
                      Your monthly contribution doesn't match your target and timeline.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleUpdateTarget}
                      >
                        Update target to match contribution
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleUpdateContribution}
                      >
                        Update contribution to meet target
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Why Statement */}
              <div className="space-y-2">
                <label htmlFor="whyStatement" className="text-sm font-medium">
                  Why is this important to you? <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="whyStatement"
                  value={whyStatement}
                  onChange={(e) => setWhyStatement(e.target.value)}
                  placeholder="What will achieving this goal mean to you?"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  This will help motivate you when things get tough.
                </p>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              {/* Submit */}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Goal'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
