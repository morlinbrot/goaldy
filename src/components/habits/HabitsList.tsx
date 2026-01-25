import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHabitGoalsRepository } from "@/contexts/RepositoryContext";
import { formatCurrency, type HabitGoalWithStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Flame, Plus, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface HabitsListProps {
  onCreateHabit: () => void;
  onSelectHabit: (habitId: string) => void;
}

// Get current month string for stats
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function HabitsList({ onCreateHabit, onSelectHabit }: HabitsListProps) {
  const habitGoalsRepository = useHabitGoalsRepository();
  const [habits, setHabits] = useState<HabitGoalWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHabits = useCallback(async () => {
    try {
      const currentMonth = getCurrentMonth();
      const habitsData = await habitGoalsRepository.getAllWithStats(currentMonth);
      setHabits(habitsData);
    } catch (error) {
      console.error('Failed to load habits:', error);
    } finally {
      setIsLoading(false);
    }
  }, [habitGoalsRepository]);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  // Subscribe to repository changes
  useEffect(() => {
    const unsubscribe = habitGoalsRepository.subscribe(() => {
      loadHabits();
    });
    return unsubscribe;
  }, [habitGoalsRepository, loadHabits]);

  // Calculate summary stats
  const compliantCount = habits.filter(h => h.is_compliant).length;
  const warningCount = habits.filter(h => h.status === 'warning').length;
  const exceededCount = habits.filter(h => h.status === 'exceeded').length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <AppHeader title="Habit Goals">
        <Button variant="ghost" size="icon" onClick={onCreateHabit}>
          <Plus className="w-5 h-5" />
        </Button>
      </AppHeader>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {habits.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <TrendingDown className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No habit goals yet</h2>
            <p className="text-muted-foreground mb-6">
              Create spending limits to build better financial habits.
            </p>
            <Button onClick={onCreateHabit}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Habit
            </Button>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="p-4">
              <Card className="bg-primary text-primary-foreground">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm opacity-80">This Month</p>
                      <p className="text-2xl font-bold">{habits.length} Habits</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>{compliantCount} on track</span>
                      </div>
                      {warningCount > 0 && (
                        <div className="flex items-center gap-1 text-sm text-yellow-200">
                          <AlertTriangle className="w-4 h-4" />
                          <span>{warningCount} warning</span>
                        </div>
                      )}
                      {exceededCount > 0 && (
                        <div className="flex items-center gap-1 text-sm text-red-200">
                          <AlertTriangle className="w-4 h-4" />
                          <span>{exceededCount} exceeded</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Habits list */}
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {habits.length} {habits.length === 1 ? 'Habit' : 'Habits'}
              </h3>
              {habits.map((habit) => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  onClick={() => onSelectHabit(habit.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface HabitCardProps {
  habit: HabitGoalWithStats;
  onClick: () => void;
}

function HabitCard({ habit, onClick }: HabitCardProps) {
  const getStatusColor = () => {
    switch (habit.status) {
      case 'safe':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'exceeded':
        return 'text-red-500';
    }
  };

  const getStatusBgColor = () => {
    switch (habit.status) {
      case 'safe':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'exceeded':
        return 'bg-red-500';
    }
  };

  const getStatusIcon = () => {
    switch (habit.status) {
      case 'safe':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'exceeded':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ backgroundColor: habit.category_color || '#64748b' }}
            >
              {habit.category_icon || '📦'}
            </span>
            <div>
              <p className="font-medium text-sm">{habit.name}</p>
              <p className="text-xs text-muted-foreground">{habit.category_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {habit.current_streak > 0 && (
              <div className="flex items-center gap-1">
                <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                <span className="text-xs font-medium text-orange-500">{habit.current_streak}</span>
              </div>
            )}
            {getStatusIcon()}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300", getStatusBgColor())}
              style={{ width: `${Math.min(100, habit.percentage_used)}%` }}
            />
          </div>
        </div>

        {/* Spending info */}
        <div className="flex justify-between text-xs">
          <span className={cn("font-medium", getStatusColor())}>
            {formatCurrency(habit.current_month_spent, '€', false)}
          </span>
          <span className="text-muted-foreground">
            of {formatCurrency(habit.current_month_target, '€', false)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
