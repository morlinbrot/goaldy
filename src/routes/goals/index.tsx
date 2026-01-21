import { GoalsList } from "@/components/goals/GoalsList";
import { useNavigate } from "@tanstack/react-router";

export function GoalsIndexRoute() {
  const navigate = useNavigate();

  return (
    <GoalsList
      onCreateGoal={() => navigate({ to: "/goals/create" })}
      onSelectGoal={(goalId) => navigate({ to: "/goals/$goalId", params: { goalId } })}
      onAllocation={() => navigate({ to: "/goals/allocation" })}
    />
  );
}
