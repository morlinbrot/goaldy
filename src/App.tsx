import { useState, useEffect } from "react";
import { BudgetSetup } from "@/components/BudgetSetup";
import { HomeScreen } from "@/components/HomeScreen";
import { FeedbackButton } from "@/components/FeedbackButton";
import { FeedbackList } from "@/components/FeedbackList";
import { getCurrentBudget, createOrUpdateBudget } from "@/lib/database";
import type { Budget } from "@/lib/types";

type View = "home" | "setup" | "feedback";

function App() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    async function loadBudget() {
      try {
        const currentBudget = await getCurrentBudget();
        setBudget(currentBudget);
        if (!currentBudget) {
          setView("setup");
        }
      } catch (error) {
        console.error('Failed to load budget:', error);
        setView("setup");
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
      setView("home");
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

  // Render based on current view
  const renderView = () => {
    switch (view) {
      case "setup":
        return (
          <BudgetSetup
            onSave={handleSaveBudget}
            initialAmount={budget?.total_amount}
          />
        );
      case "feedback":
        return <FeedbackList onBack={() => setView("home")} />;
      case "home":
      default:
        if (!budget) {
          setView("setup");
          return null;
        }
        return (
          <HomeScreen
            budget={budget}
            onEditBudget={() => setView("setup")}
            onViewFeedback={() => setView("feedback")}
          />
        );
    }
  };

  return (
    <>
      {renderView()}
      {/* Show feedback button on all views except feedback list */}
      {view !== "feedback" && <FeedbackButton />}
    </>
  );
}

export default App;
