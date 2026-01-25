import { BudgetSetup } from "@/components/BudgetSetup";
import { useBudgetsRepository } from "@/contexts/RepositoryContext";
import { getCurrentMonth } from "@/lib/types";
import { useNavigate } from "@tanstack/react-router";
import { useAppState } from "./RootLayout";

export function SetupRoute() {
  const navigate = useNavigate();
  const { budget, setBudget } = useAppState();
  const budgetsRepo = useBudgetsRepository();

  const handleSaveBudget = async (totalAmount: number, spendingLimit?: number) => {
    try {
      const newBudget = await budgetsRepo.upsertForMonth(getCurrentMonth(), {
        total_amount: totalAmount,
        spending_limit: spendingLimit ?? null,
      });
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
