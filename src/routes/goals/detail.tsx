import { GoalDashboard } from "@/components/goals/GoalDashboard";
import { useSavingsGoalsRepository } from "@/contexts/RepositoryContext";
import { useSync } from "@/contexts/SyncContext";
import type { SavingsGoalWithStats } from "@/lib/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export function GoalDetailRoute() {
  const navigate = useNavigate();
  const { goalId } = useParams({ from: "/goals/$goalId" });
  const savingsGoalsRepository = useSavingsGoalsRepository();
  const { refreshStatus } = useSync();
  const [goal, setGoal] = useState<SavingsGoalWithStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadGoalData = useCallback(async () => {
    try {
      const goalData = await savingsGoalsRepository.getWithStats(goalId);
      setGoal(goalData);
    } catch (error) {
      console.error('Failed to load goal:', error);
      navigate({ to: "/goals" });
    } finally {
      setIsLoading(false);
    }
  }, [goalId, navigate, savingsGoalsRepository]);

  useEffect(() => {
    loadGoalData();
  }, [loadGoalData]);

  const handleGoalDeleted = async () => {
    await refreshStatus();
    navigate({ to: "/goals" });
  };

  const handleGoalUpdated = async () => {
    await loadGoalData();
    await refreshStatus();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!goal) {
    return null;
  }

  return (
    <GoalDashboard
      goal={goal}
      onBack={() => navigate({ to: "/goals" })}
      onCheckIn={() => navigate({ to: "/goals/$goalId/checkin", params: { goalId } })}
      onDeleted={handleGoalDeleted}
      onUpdated={handleGoalUpdated}
    />
  );
}
