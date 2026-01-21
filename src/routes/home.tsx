import { HomeScreen } from "@/components/HomeScreen";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppState } from "./RootLayout";

export function HomeRoute() {
  const navigate = useNavigate();
  const { budget } = useAppState();

  useEffect(() => {
    if (!budget) {
      navigate({ to: "/setup" });
    }
  }, [budget, navigate]);

  if (!budget) {
    return null;
  }

  return (
    <HomeScreen
      budget={budget}
      onEditBudget={() => navigate({ to: "/setup" })}
    />
  );
}
