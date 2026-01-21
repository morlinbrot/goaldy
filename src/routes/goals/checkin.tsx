import { MonthlyCheckIn } from "@/components/goals/MonthlyCheckIn";
import { useSync } from "@/contexts/SyncContext";
import { useNavigate, useParams } from "@tanstack/react-router";

export function GoalCheckInRoute() {
  const navigate = useNavigate();
  const { goalId } = useParams({ from: "/goals/$goalId/checkin" });
  const { refreshStatus } = useSync();

  const handleCheckInComplete = async () => {
    await refreshStatus();
    navigate({ to: "/goals/$goalId", params: { goalId } });
  };

  return (
    <MonthlyCheckIn
      goalId={goalId}
      onComplete={handleCheckInComplete}
      onBack={() => navigate({ to: "/goals/$goalId", params: { goalId } })}
    />
  );
}
