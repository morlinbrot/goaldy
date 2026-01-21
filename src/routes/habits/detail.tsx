import { HabitDashboard } from "@/components/habits/HabitDashboard";
import { useSync } from "@/contexts/SyncContext";
import { getHabitGoalWithStats } from "@/lib/database";
import type { HabitGoalWithStats } from "@/lib/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export function HabitDetailRoute() {
  const navigate = useNavigate();
  const { habitId } = useParams({ from: "/habits/$habitId" });
  const { refreshStatus } = useSync();
  const [habit, setHabit] = useState<HabitGoalWithStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHabitData = useCallback(async () => {
    try {
      const habitData = await getHabitGoalWithStats(habitId);
      setHabit(habitData);
    } catch (error) {
      console.error('Failed to load habit:', error);
      navigate({ to: "/habits" });
    } finally {
      setIsLoading(false);
    }
  }, [habitId, navigate]);

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
