import { useState, useEffect } from "react";
import { BudgetSetup } from "@/components/BudgetSetup";
import { HomeScreen } from "@/components/HomeScreen";
import { getCurrentBudget, createOrUpdateBudget } from "@/lib/database";
import type { Budget } from "@/lib/types";

function App() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    async function loadBudget() {
      try {
        const currentBudget = await getCurrentBudget();
        setBudget(currentBudget);
        setShowSetup(!currentBudget);
      } catch (error) {
        console.error('Failed to load budget:', error);
        setShowSetup(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadBudget();
  }, []);

  const handleSaveBudget = async (totalAmount: number, spendingLimit?: number) => {
    try {
      const newBudget = await createOrUpdateBudget(totalAmount, spendingLimit);
      setBudget(newBudget);
      setShowSetup(false);
    } catch (error) {
      console.error('Failed to save budget:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (showSetup || !budget) {
    return (
      <BudgetSetup
        onSave={handleSaveBudget}
        initialAmount={budget?.total_amount}
      />
    );
  }

  return (
    <HomeScreen
      budget={budget}
      onEditBudget={() => setShowSetup(true)}
    />
  );
}

export default App;
