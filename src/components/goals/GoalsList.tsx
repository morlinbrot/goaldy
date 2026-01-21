import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAllSavingsGoalsWithStats } from "@/lib/database";
import { formatCurrency, type SavingsGoalWithStats } from "@/lib/types";
import { Plus, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SavingsGoalHeader } from "./SavingsGoalHeader";

interface GoalsListProps {
  onCreateGoal: () => void;
  onSelectGoal: (goalId: string) => void;
  onAllocation: () => void;
}

export function GoalsList({ onCreateGoal, onSelectGoal, onAllocation }: GoalsListProps) {
  const [goals, setGoals] = useState<SavingsGoalWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadGoals = useCallback(async () => {
    try {
      const goalsData = await getAllSavingsGoalsWithStats();
      setGoals(goalsData);
    } catch (error) {
      console.error('Failed to load goals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  // Calculate total monthly contribution
  const totalMonthlyContribution = goals.reduce((sum, goal) => sum + goal.monthly_contribution, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + goal.total_saved, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.target_amount, 0);

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
      <AppHeader title="Savings Goals">
        <Button variant="ghost" size="icon" onClick={onCreateGoal}>
          <Plus className="w-5 h-5" />
        </Button>
      </AppHeader>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {goals.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Target className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No savings goals yet</h2>
            <p className="text-muted-foreground mb-6">
              Start your journey to financial freedom by creating your first savings goal.
            </p>
            <Button onClick={onCreateGoal}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Goal
            </Button>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="p-4">
              <Card className="bg-primary text-primary-foreground">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm opacity-80">Total Saved</p>
                      <p className="text-2xl font-bold">{formatCurrency(totalSaved)}</p>
                      <p className="text-sm opacity-80 mt-1">
                        of {formatCurrency(totalTarget)} target
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm opacity-80">Monthly</p>
                      <p className="text-lg font-semibold">{formatCurrency(totalMonthlyContribution)}</p>
                    </div>
                  </div>
                  {/* Overall progress bar */}
                  <div className="mt-4">
                    <div className="h-2 bg-primary-foreground/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-foreground rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (totalSaved / totalTarget) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs opacity-80 mt-1">
                      {Math.round((totalSaved / totalTarget) * 100)}% overall progress
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Allocation button */}
            {goals.length > 1 && (
              <div className="px-4">
                <Button variant="outline" className="w-full" onClick={onAllocation}>
                  Manage Allocation
                </Button>
              </div>
            )}

            {/* Goals list */}
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {goals.length} {goals.length === 1 ? 'Goal' : 'Goals'}
              </h3>
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onClick={() => onSelectGoal(goal.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface GoalCardProps {
  goal: SavingsGoalWithStats;
  onClick: () => void;
}

function GoalCard({ goal, onClick }: GoalCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <SavingsGoalHeader goal={goal} variant="list" onClick={onClick} />
      </CardContent>
    </Card>
  );
}
