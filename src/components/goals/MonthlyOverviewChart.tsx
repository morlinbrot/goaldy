import { Input } from "@/components/ui/input";
import { useSavingsContributionsRepository } from "@/contexts/RepositoryContext";
import { formatCurrency, type SavingsContribution, type SavingsGoalWithStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MonthlyOverviewChartProps {
  goal: SavingsGoalWithStats;
  onContributionUpdated: () => void;
}

interface MonthData {
  month: string;
  shortLabel: string;
  contribution: SavingsContribution | null;
  heightPercent: number;
  barColor: string;
  isCurrent: boolean;
}

export function MonthlyOverviewChart({ goal, onContributionUpdated }: MonthlyOverviewChartProps) {
  const savingsContributionsRepository = useSavingsContributionsRepository();
  const [contributions, setContributions] = useState<SavingsContribution[]>([]);
  const [tooltipMonth, setTooltipMonth] = useState<string | null>(null);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch contributions from database
  // Re-fetch when goal.total_saved changes (indicates a contribution was added/updated)
  useEffect(() => {
    const loadContributions = async () => {
      const data = await savingsContributionsRepository.getByGoal(goal.id);
      setContributions(data);
    };
    loadContributions();
  }, [goal.id, goal.total_saved, savingsContributionsRepository]);

  useEffect(() => {
    if (editingMonth && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [editingMonth]);

  // Calculate how many months of full contribution are still needed to reach the goal
  const calculateMonthsNeeded = (): number => {
    const amountRemaining = goal.target_amount - goal.total_saved;
    if (amountRemaining <= 0 || goal.monthly_contribution <= 0) return 0;
    return Math.ceil(amountRemaining / goal.monthly_contribution);
  };

  // Build month data for the chart (Jan -> Dec of current year)
  const getMonthsData = (): MonthData[] => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();
    const monthsNeeded = calculateMonthsNeeded();

    const months: MonthData[] = [];
    let futureMonthsMarked = 0;

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const monthStr = `${currentYear}-${String(monthIndex + 1).padStart(2, "0")}`;
      const contribution = contributions.find((c) => c.month === monthStr) || null;
      const isCurrent = monthIndex === currentMonthIndex;
      const isFuture = monthIndex > currentMonthIndex;

      let heightPercent = 0;
      let barColor = "bg-muted/20"; // default for inactive/empty months

      if (contribution) {
        const amount = contribution.amount;
        const target = goal.monthly_contribution;

        if (amount > target) {
          // Exceeded target -> gold, full height
          heightPercent = 100;
          barColor = "bg-fuchsia-500";
        } else if (amount === target) {
          // Met target exactly -> green, full height
          heightPercent = 100;
          barColor = "bg-green-500";
        } else {
          // Below target -> proportional height, green
          heightPercent = target > 0 ? (amount / target) * 100 : 0;
          barColor = heightPercent < 30 ? "bg-red-500" : heightPercent < 60 ? "bg-orange-500" : heightPercent < 80 ? "bg-yellow-500" : "bg-teal-500";
        }
      } else if (isFuture && futureMonthsMarked < monthsNeeded) {
        // Future month needed to reach goal -> light gray, full height
        heightPercent = 100;
        barColor = "bg-green-500/10";
        futureMonthsMarked++;
      }

      months.push({
        month: monthStr,
        shortLabel: new Date(currentYear, monthIndex).toLocaleDateString("en-US", { month: "short" }),
        contribution,
        heightPercent,
        barColor,
        isCurrent,
      });
    }

    return months;
  };

  const handleBarClick = (monthData: MonthData) => {
    // Only allow interaction for months with actual contributions
    if (!monthData.contribution) return;

    if (tooltipMonth === monthData.month) {
      // Second click on same bar -> open edit mode
      setEditValue(monthData.contribution.amount.toString());
      setEditingMonth(monthData.month);
      setTooltipMonth(null);
    } else {
      // First click -> show tooltip
      setTooltipMonth(monthData.month);
      setEditingMonth(null);
    }
  };

  const handleSaveContribution = async () => {
    if (!editingMonth) return;
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount < 0) return;

    setIsSaving(true);
    try {
      await savingsContributionsRepository.upsertForGoalMonth(goal.id, editingMonth, {
        amount,
        is_full_amount: amount >= goal.monthly_contribution ? 1 : 0,
      });
      setEditingMonth(null);
      setEditValue("");
      // onContributionUpdated will trigger parent to refresh goal data,
      // which will update goal.total_saved and trigger our useEffect to reload contributions
      onContributionUpdated();
    } catch (error) {
      console.error("Failed to save contribution:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingMonth(null);
    setEditValue("");
  };

  const monthsData = getMonthsData();

  return (
    <div className="p-4 bg-secondary/30 rounded-lg">
      {/* Bar chart */}
      <div className="flex items-end gap-2 h-20 mb-2">
        {monthsData.map((m) => {
          const isTooltipShown = tooltipMonth === m.month && !editingMonth;
          const hasContribution = !!m.contribution;

          return (
            <div key={m.month} className="flex-1 min-w-0 relative h-full">
              {/* Tooltip */}
              {isTooltipShown && m.contribution && (
                <button
                  type="button"
                  className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-10 cursor-pointer hover:bg-foreground/90"
                  onClick={() => {
                    setEditValue(m.contribution!.amount.toString());
                    setEditingMonth(m.month);
                    setTooltipMonth(null);
                  }}
                >
                  {formatCurrency(m.contribution.amount)}
                </button>
              )}

              {/* Bar */}
              <button
                type="button"
                className={cn(
                  "w-full absolute bottom-0 left-0 right-0 rounded-t transition-all",
                  m.barColor,
                  hasContribution && "cursor-pointer hover:opacity-80"
                )}
                style={{ height: `${Math.max(m.heightPercent, 4)}%` }}
                onClick={() => handleBarClick(m)}
                disabled={!hasContribution}
              />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-2">
        {monthsData.map((m) => (
          <div key={m.month} className="flex-1 text-center min-w-0">
            <span
              className={cn(
                "text-[10px]",
                m.isCurrent ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              {m.shortLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editingMonth && (
        <div className="mt-4 p-3 bg-background rounded-lg border">
          <p className="text-sm font-medium mb-2">
            {new Date(editingMonth + "-01").toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                €
              </span>
              <Input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="pl-8"
                placeholder={goal.monthly_contribution.toString()}
                disabled={isSaving}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveContribution();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancelEdit();
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={handleSaveContribution}
              disabled={isSaving}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-md hover:bg-accent disabled:opacity-50"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
