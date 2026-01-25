import { HabitDashboard } from "@/components/habits/HabitDashboard";
import { useHabitGoalsRepository } from "@/contexts/RepositoryContext";
import { useSync } from "@/contexts/SyncContext";
import type { HabitGoalWithStats } from "@/lib/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

// Get current month string for stats
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function HabitDetailRoute() {
  const navigate = useNavigate();
  const { habitId } = useParams({ from: "/habits/$habitId" });
  const habitGoalsRepository = useHabitGoalsRepository();
  const { refreshStatus } = useSync();
  const [habit, setHabit] = useState<HabitGoalWithStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHabitData = useCallback(async () => {
    try {
      const currentMonth = getCurrentMonth();
      const habitData = await habitGoalsRepository.getWithStats(habitId, currentMonth);
      setHabit(habitData);
    } catch (error) {
      console.error('Failed to load habit:', error);
      navigate({ to: "/habits" });
    } finally {
      setIsLoading(false);
    }
  }, [habitId, navigate, habitGoalsRepository]);

  useEffect(() => {
    loadHabitData();
  }, [loadHabitData]);

  const handleHabitDeleted = async () => {
    await refreshStatus();
    navigate({ to: "/habits" });
  };

  const handleHabitUpdated = async () => {
    await loadHabitData();
    await refreshStatus();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!habit) {
    return null;
  }

  return (
    <HabitDashboard
      habit={habit}
      onBack={() => navigate({ to: "/habits" })}
      onDeleted={handleHabitDeleted}
      onUpdated={handleHabitUpdated}
    />
  );
}
