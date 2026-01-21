import { AllocationView } from "@/components/goals/AllocationView";
import { useSync } from "@/contexts/SyncContext";
import { useNavigate } from "@tanstack/react-router";

export function GoalAllocationRoute() {
  const navigate = useNavigate();
  const { refreshStatus } = useSync();

  const handleAllocationSaved = async () => {
    await refreshStatus();
    navigate({ to: "/goals" });
  };

  return (
    <AllocationView
      onBack={() => navigate({ to: "/goals" })}
      onSaved={handleAllocationSaved}
    />
  );
}
