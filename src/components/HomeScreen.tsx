import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, type Budget, type Category, type ExpenseWithCategory } from "@/lib/types";
import { getCategories, addExpense, getExpensesForMonth, getMonthlySpending, deleteExpense } from "@/lib/database";
import { Numpad } from "./Numpad";
import { CategorySelector } from "./CategorySelector";
import { ExpenseList } from "./ExpenseList";
import { Button } from "@/components/ui/button";
import { Settings, ChevronDown, ChevronUp } from "lucide-react";

interface HomeScreenProps {
  budget: Budget;
  onEditBudget: () => void;
}

export function HomeScreen({ budget, onEditBudget }: HomeScreenProps) {
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [cats, exps, spent] = await Promise.all([
        getCategories(),
        getExpensesForMonth(),
        getMonthlySpending(),
      ]);
      setCategories(cats);
      setExpenses(exps);
      setTotalSpent(spent);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const remaining = (budget.spending_limit ?? budget.total_amount) - totalSpent;
  const percentUsed = totalSpent / (budget.spending_limit ?? budget.total_amount);

  // Calculate days remaining in month
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = lastDay - now.getDate() + 1;

  const handleAddExpense = async () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) return;

    setIsLoading(true);
    try {
      await addExpense(value, selectedCategory || undefined);
      setAmount('');
      setSelectedCategory(null);
      setShowCategories(false);
      await loadData();
    } catch (error) {
      console.error('Failed to add expense:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpense(id);
      await loadData();
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  const handleEditExpense = (expense: ExpenseWithCategory) => {
    // For now, just log - we'll implement a proper edit modal later
    console.log('Edit expense:', expense);
  };

  // Get month name for display
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-semibold">Goaldy</h1>
        <Button variant="ghost" size="icon" onClick={onEditBudget}>
          <Settings className="w-5 h-5" />
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Balance display */}
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {monthName} - {daysRemaining} days left
          </p>
          <div
            className={cn(
              "text-5xl font-bold mb-2 transition-colors",
              remaining < 0 && "text-destructive",
              remaining >= 0 && percentUsed > 0.8 && "text-yellow-500",
              remaining >= 0 && percentUsed <= 0.8 && "text-foreground"
            )}
          >
            {formatCurrency(remaining)}
          </div>
          <p className="text-sm text-muted-foreground">remaining</p>

          {/* Progress bar */}
          <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                percentUsed > 1 && "bg-destructive",
                percentUsed > 0.8 && percentUsed <= 1 && "bg-yellow-500",
                percentUsed <= 0.8 && "bg-primary"
              )}
              style={{ width: `${Math.min(percentUsed * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrency(totalSpent)} of {formatCurrency(budget.spending_limit ?? budget.total_amount)} spent
          </p>
        </div>

        {/* Quick expense entry */}
        <div className="px-4 pb-4">
          {/* Amount display */}
          <div className="text-center mb-4">
            <div className="text-4xl font-semibold h-12 flex items-center justify-center">
              {amount ? (
                <span>€{amount}</span>
              ) : (
                <span className="text-muted-foreground">€0</span>
              )}
            </div>
          </div>

          {/* Category toggle */}
          <button
            type="button"
            onClick={() => setShowCategories(!showCategories)}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground mb-3 py-2"
          >
            {selectedCategory ? (
              <>
                <span>{categories.find(c => c.id === selectedCategory)?.icon}</span>
                <span>{categories.find(c => c.id === selectedCategory)?.name}</span>
              </>
            ) : (
              <span>Add category (optional)</span>
            )}
            {showCategories ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Categories */}
          {showCategories && (
            <div className="mb-4">
              <CategorySelector
                categories={categories}
                selected={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </div>
          )}

          {/* Numpad */}
          <Numpad
            value={amount}
            onChange={setAmount}
            onConfirm={handleAddExpense}
            disabled={isLoading}
          />
        </div>

        {/* Recent expenses */}
        <div className="border-t">
          <button
            type="button"
            onClick={() => setShowExpenses(!showExpenses)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
          >
            <span>Recent Expenses ({expenses.length})</span>
            {showExpenses ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showExpenses && (
            <div className="px-4 pb-4">
              <ExpenseList
                expenses={expenses}
                onEdit={handleEditExpense}
                onDelete={handleDeleteExpense}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
