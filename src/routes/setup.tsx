import { BudgetSetup } from "@/components/BudgetSetup";
import { createOrUpdateBudget } from "@/lib/database";
import { useNavigate } from "@tanstack/react-router";
import { useAppState } from "./RootLayout";

export function SetupRoute() {
  const navigate = useNavigate();
  const { budget, setBudget } = useAppState();

  const handleSaveBudget = async (totalAmount: number, spendingLimit?: number) => {
    try {
      const newBudget = await createOrUpdateBudget(totalAmount, spendingLimit);
      setBudget(newBudget);
      navigate({ to: "/" });
    } catch (error) {
      console.error('Failed to save budget:', error);
      throw error; // Re-throw so BudgetSetup can show error
    }
  };

  return (
    <BudgetSetup
      onSave={handleSaveBudget}
      initialAmount={budget?.total_amount}
    />
  );
}
