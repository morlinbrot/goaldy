import { HabitCreationForm } from "@/components/habits/HabitCreationForm";
import { useSync } from "@/contexts/SyncContext";
import { useNavigate } from "@tanstack/react-router";

export function HabitCreateRoute() {
  const navigate = useNavigate();
  const { refreshStatus } = useSync();

  const handleHabitCreated = async () => {
    await refreshStatus();
    navigate({ to: "/habits" });
  };

  return (
    <HabitCreationForm
      onHabitCreated={handleHabitCreated}
      onBack={() => navigate({ to: "/habits" })}
    />
  );
}
