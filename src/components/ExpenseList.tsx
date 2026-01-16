import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, type ExpenseWithCategory } from "@/lib/types";
import { Trash2, ChevronRight } from "lucide-react";

interface ExpenseListProps {
  expenses: ExpenseWithCategory[];
  onEdit: (expense: ExpenseWithCategory) => void;
  onDelete: (id: string) => void;
}

export function ExpenseList({ expenses, onEdit, onDelete }: ExpenseListProps) {
  const [swipedId, setSwipedId] = useState<string | null>(null);

  if (expenses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No expenses yet</p>
        <p className="text-sm">Add your first expense above</p>
      </div>
    );
  }

  // Group expenses by date
  const groupedExpenses = expenses.reduce((groups, expense) => {
    const date = expense.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(expense);
    return groups;
  }, {} as Record<string, ExpenseWithCategory[]>);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="space-y-4">
      {Object.entries(groupedExpenses).map(([date, dayExpenses]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">
            {formatDate(date)}
          </h3>
          <div className="space-y-2">
            {dayExpenses.map((expense) => (
              <div
                key={expense.id}
                className="relative overflow-hidden rounded-lg"
              >
                {/* Delete button revealed on swipe */}
                <div className="absolute inset-y-0 right-0 flex items-center">
                  <button
                    onClick={() => onDelete(expense.id)}
                    className="h-full px-6 bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Main expense card */}
                <div
                  onClick={() => {
                    if (swipedId === expense.id) {
                      setSwipedId(null);
                    } else {
                      onEdit(expense);
                    }
                  }}
                  className={cn(
                    "relative bg-card border rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-transform",
                    "active:bg-accent/50",
                    swipedId === expense.id && "-translate-x-16"
                  )}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    const startX = touch.clientX;
                    const el = e.currentTarget;

                    const handleTouchMove = (e: TouchEvent) => {
                      const diff = startX - e.touches[0].clientX;
                      if (diff > 50) {
                        setSwipedId(expense.id);
                      } else if (diff < -20) {
                        setSwipedId(null);
                      }
                    };

                    const handleTouchEnd = () => {
                      el.removeEventListener('touchmove', handleTouchMove);
                      el.removeEventListener('touchend', handleTouchEnd);
                    };

                    el.addEventListener('touchmove', handleTouchMove);
                    el.addEventListener('touchend', handleTouchEnd);
                  }}
                >
                  {/* Category icon */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: expense.category_color ? `${expense.category_color}20` : 'hsl(var(--secondary))' }}
                  >
                    {expense.category_icon || '📦'}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {expense.note || expense.category_name || 'Expense'}
                    </div>
                    {expense.note && expense.category_name && (
                      <div className="text-sm text-muted-foreground truncate">
                        {expense.category_name}
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="font-semibold">
                      {formatCurrency(expense.amount)}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
