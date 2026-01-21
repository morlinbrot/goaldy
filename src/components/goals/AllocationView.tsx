import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAllSavingsGoalsWithStats, updateSavingsGoal } from "@/lib/database";
import { formatCurrency, type SavingsGoalWithStats } from "@/lib/types";
import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface AllocationViewProps {
  onBack: () => void;
  onSaved: () => void;
}

interface AllocationItem {
  goalId: string;
  goalName: string;
  currentAmount: number;
  newAmount: string;
}

export function AllocationView({ onBack, onSaved }: AllocationViewProps) {
  const [goals, setGoals] = useState<SavingsGoalWithStats[]>([]);
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadGoals = useCallback(async () => {
    try {
      const goalsData = await getAllSavingsGoalsWithStats();
      setGoals(goalsData);
      setAllocations(goalsData.map(goal => ({
        goalId: goal.id,
        goalName: goal.name,
        currentAmount: goal.monthly_contribution,
        newAmount: goal.monthly_contribution.toString(),
      })));
    } catch (error) {
      console.error('Failed to load goals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const handleAmountChange = (goalId: string, value: string) => {
    setAllocations(prev => prev.map(item =>
      item.goalId === goalId
        ? { ...item, newAmount: value }
        : item
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const allocation of allocations) {
        const newAmount = parseFloat(allocation.newAmount);
        if (!isNaN(newAmount) && newAmount !== allocation.currentAmount) {
          await updateSavingsGoal(allocation.goalId, {
            monthly_contribution: newAmount,
          });
        }
      }
      onSaved();
    } catch (error) {
      console.error('Failed to save allocations:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate totals
  const totalCurrent = allocations.reduce((sum, item) => sum + item.currentAmount, 0);
  const totalNew = allocations.reduce((sum, item) => {
    const val = parseFloat(item.newAmount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <AppHeader title="Allocation" onBack={onBack}>
        {hasChanges && (
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Check className="w-4 h-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </AppHeader>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Summary */}
        <div className="p-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Total Monthly Savings</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalNew)}</p>
                </div>
                {totalNew !== totalCurrent && (
                  <div className="text-right text-sm">
                    <span className="text-muted-foreground">was </span>
                    <span>{formatCurrency(totalCurrent)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Description */}
        <div className="px-4">
          <p className="text-sm text-muted-foreground">
            Distribute your monthly savings budget across your goals. Adjust the amounts to prioritize what matters most.
          </p>
        </div>

        {/* Allocations list */}
        <div className="p-4 space-y-3">
          {allocations.map((allocation) => {
            const goal = goals.find(g => g.id === allocation.goalId);
            const newAmount = parseFloat(allocation.newAmount);
            const isValid = !isNaN(newAmount) && newAmount >= 0;

            return (
              <Card key={allocation.goalId}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{allocation.goalName}</h4>
                      {goal && (
                        <p className="text-xs text-muted-foreground">
                          {Math.round(goal.percentage_complete)}% saved · {goal.months_remaining} months left
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      €
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      value={allocation.newAmount}
                      onChange={(e) => handleAmountChange(allocation.goalId, e.target.value)}
                      className={`pl-8 ${!isValid ? 'border-destructive' : ''}`}
                      disabled={isSaving}
                    />
                  </div>

                  {goal && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {isValid && newAmount > 0 ? (
                        (() => {
                          const remaining = goal.target_amount - goal.total_saved;
                          const monthsToComplete = Math.ceil(remaining / newAmount);
                          const completionDate = new Date();
                          completionDate.setMonth(completionDate.getMonth() + monthsToComplete);
                          return `At this rate: ${completionDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
                        })()
                      ) : (
                        'Enter an amount to see projected completion'
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
