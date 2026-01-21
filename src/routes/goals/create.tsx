import { GoalCreationForm } from "@/components/goals/GoalCreationForm";
import { useSync } from "@/contexts/SyncContext";
import { useNavigate } from "@tanstack/react-router";

export function GoalCreateRoute() {
  const navigate = useNavigate();
  const { refreshStatus } = useSync();

  const handleGoalCreated = async () => {
    await refreshStatus();
    navigate({ to: "/goals" });
  };

  return (
    <GoalCreationForm
      onGoalCreated={handleGoalCreated}
      onBack={() => navigate({ to: "/goals" })}
    />
  );
}
