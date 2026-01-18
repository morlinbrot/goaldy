import { formatCurrency, type SavingsGoalWithStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

interface SavingsGoalHeaderProps {
  goal: SavingsGoalWithStats;
  variant: 'list' | 'detail';
  /** For list variant: callback when card is clicked */
  onClick?: () => void;
  /** For detail variant: custom render for the target amount (e.g., to make it clickable) */
  renderTarget?: () => React.ReactNode;
  /** For detail variant: render additional content below amounts (e.g., editable fields) */
  children?: React.ReactNode;
}

/**
 * Get progress bar and text color based on percentage
 * Single source of truth for progress colors across the app
 */
export function getProgressColor(progressPercent: number, type: 'text' | 'bg'): string {
  if (progressPercent >= 80) return type === 'text' ? 'text-green-500' : 'bg-green-500';
  if (progressPercent >= 50) return type === 'text' ? 'text-lime-500' : 'bg-lime-500';
  if (progressPercent >= 20) return type === 'text' ? 'text-amber-400' : 'bg-amber-400';
  return type === 'text' ? 'text-orange-500' : 'bg-orange-500';
}

export function SavingsGoalHeader({ goal, variant, onClick, renderTarget, children }: SavingsGoalHeaderProps) {
  const progressPercent = Math.min(100, goal.percentage_complete);
  const isCompleted = goal.percentage_complete >= 100;

  if (variant === 'list') {
    return (
      <div
        className={cn("cursor-pointer", onClick && "hover:bg-accent/50 transition-colors")}
        onClick={onClick}
      >
        {/* Header with name and streak */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{goal.name}</h4>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(goal.total_saved)} of {formatCurrency(goal.target_amount)}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {goal.current_streak > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-medium">{goal.current_streak}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              getProgressColor(progressPercent, 'bg')
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Progress text below */}
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{Math.round(progressPercent)}% complete</span>
          <span>
            {isCompleted ? (
              <span className="text-green-600 font-medium">Completed!</span>
            ) : (
              `${goal.months_remaining} months left`
            )}
          </span>
        </div>
      </div>
    );
  }

  // Detail variant
  return (
    <div>
      {/* Amount and colored percentage */}
      <div className="mb-2">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-3xl font-bold">{formatCurrency(goal.total_saved, '€', false)}</span>
            {renderTarget ? (
              renderTarget()
            ) : (
              <span className="text-muted-foreground ml-2">
                of {formatCurrency(goal.target_amount, '€', false)}
              </span>
            )}
          </div>
          <span className={cn("text-2xl font-bold", getProgressColor(progressPercent, 'text'))}>
            {Math.round(progressPercent)}%
          </span>
        </div>

        {/* Children slot for editable fields */}
        {children}
      </div>

      {/* Progress bar */}
      <div className="h-4 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            getProgressColor(progressPercent, 'bg')
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
