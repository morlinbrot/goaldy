import { HabitsList } from "@/components/habits/HabitsList";
import { useNavigate } from "@tanstack/react-router";

export function HabitsIndexRoute() {
  const navigate = useNavigate();

  return (
    <HabitsList
      onCreateHabit={() => navigate({ to: "/habits/create" })}
      onSelectHabit={(habitId) => navigate({ to: "/habits/$habitId", params: { habitId } })}
    />
  );
}
