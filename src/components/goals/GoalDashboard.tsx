import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebug } from "@/contexts/DebugContext";
import { clearContributionsForGoal, deleteSavingsGoal, getContributionForMonth, updateSavingsGoal } from "@/lib/database";
import { formatCurrency, type SavingsGoalWithStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowLeft, Award, CalendarIcon, Check, ChevronDown, ChevronUp, Flame, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MonthlyOverviewChart } from "./MonthlyOverviewChart";
import { SavingsGoalHeader } from "./SavingsGoalHeader";

// Get minimum date (one month from now)
function getMinDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date;
}

// Get current month string for check-in
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface GoalDashboardProps {
  goal: SavingsGoalWithStats;
  onBack: () => void;
  onCheckIn: (goalId: string) => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

export function GoalDashboard({ goal, onBack, onCheckIn, onDeleted, onUpdated }: GoalDashboardProps) {
  const { isDebugMode } = useDebug();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Edit states
  const [editingField, setEditingField] = useState<'contribution' | 'date' | 'target' | null>(null);
  const [editContributionValue, setEditContributionValue] = useState('');
  const [editTargetValue, setEditTargetValue] = useState('');
  const [editDateValue, setEditDateValue] = useState<Date | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const contributionInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  // Monthly chart expansion
  const [showMonthlyChart, setShowMonthlyChart] = useState(false);

  // Current month contribution state
  const [currentMonthContribution, setCurrentMonthContribution] = useState<number | null>(null);

  const loadCurrentMonthContribution = useCallback(async () => {
    const currentMonth = getCurrentMonth();
    const contribution = await getContributionForMonth(goal.id, currentMonth);
    setCurrentMonthContribution(contribution?.amount ?? null);
  }, [goal.id]);

  useEffect(() => {
    loadCurrentMonthContribution();
  }, [loadCurrentMonthContribution]);

  // Focus input when editing
  useEffect(() => {
    if (editingField === 'contribution' && contributionInputRef.current) {
      setTimeout(() => {
        contributionInputRef.current?.focus();
        contributionInputRef.current?.select();
      }, 100);
    }
    if (editingField === 'target' && targetInputRef.current) {
      setTimeout(() => {
        targetInputRef.current?.focus();
        targetInputRef.current?.select();
      }, 100);
    }
  }, [editingField]);

  const handleStartEdit = (field: 'contribution' | 'date' | 'target') => {
    if (field === 'contribution') {
      setEditContributionValue(goal.monthly_contribution.toString());
    } else if (field === 'target') {
      setEditTargetValue(goal.target_amount.toString());
    } else {
      setEditDateValue(new Date(goal.target_date));
    }
    setEditingField(field);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditContributionValue('');
    setEditTargetValue('');
    setEditDateValue(undefined);
  };

  const handleSaveContribution = async () => {
    const newValue = parseFloat(editContributionValue);
    if (isNaN(newValue) || newValue <= 0) return;

    setIsSaving(true);
    try {
      await updateSavingsGoal(goal.id, { monthly_contribution: newValue });
      setEditingField(null);
      setEditContributionValue('');
      onUpdated();
    } catch (error) {
      console.error('Failed to update contribution:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTarget = async () => {
    const newValue = parseFloat(editTargetValue);
    if (isNaN(newValue) || newValue <= 0) return;

    setIsSaving(true);
    try {
      await updateSavingsGoal(goal.id, { target_amount: newValue });
      setEditingField(null);
      setEditTargetValue('');
      onUpdated();
    } catch (error) {
      console.error('Failed to update target amount:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDate = async (date: Date | undefined) => {
    if (!date) return;

    setIsSaving(true);
    try {
      await updateSavingsGoal(goal.id, { target_date: date.toISOString().split('T')[0] });
      setEditingField(null);
      setEditDateValue(undefined);
      onUpdated();
    } catch (error) {
      console.error('Failed to update date:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSavingsGoal(goal.id);
      onDeleted();
    } catch (error) {
      console.error('Failed to delete goal:', error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClearContributions = async () => {
    setIsClearing(true);
    try {
      await clearContributionsForGoal(goal.id);
      setShowClearConfirm(false);
      onUpdated();
    } catch (error) {
      console.error('Failed to clear contributions:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleContributionUpdated = () => {
    loadCurrentMonthContribution();
    onUpdated();
  };

  // Get color for this month's contribution based on target
  const getContributionColor = () => {
    if (currentMonthContribution === null) return 'text-muted-foreground';
    const percent = (currentMonthContribution / goal.monthly_contribution) * 100;
    if (percent >= 100) return 'text-green-500';
    if (percent >= 80) return 'text-lime-500';
    if (percent >= 50) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const isCompleted = goal.percentage_complete >= 100;

  // Format target date
  const targetDate = new Date(goal.target_date);
  const targetDateFormatted = targetDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Format projected completion
  const projectedDate = goal.projected_completion_date
    ? new Date(goal.projected_completion_date).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold truncate">{goal.name}</h1>
        </div>
        <div className="flex items-center gap-1">
          {isDebugMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowClearConfirm(true)}
              className="text-muted-foreground hover:text-orange-500"
              title="Clear all contributions (debug)"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Progress section - compact horizontal design */}
        <div className="p-4">
          {/* Target editing mode */}
          {editingField === 'target' ? (
            <div className="mb-2">
              <p className="text-sm font-medium mb-2">Target Amount</p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    ref={targetInputRef}
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="1"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(e.target.value)}
                    className="pl-8 text-lg"
                    disabled={isSaving}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveTarget();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelEdit();
                      }
                    }}
                  />
                </div>
                <Button onClick={handleSaveTarget} disabled={isSaving}>
                  <Check className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="ghost" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <SavingsGoalHeader
              goal={goal}
              variant="detail"
              renderTarget={() => (
                <button
                  type="button"
                  className="text-muted-foreground ml-2 hover:text-foreground hover:underline cursor-pointer"
                  onClick={() => handleStartEdit('target')}
                >
                  of {formatCurrency(goal.target_amount, '€', false)}
                </button>
              )}
            >
              {/* Monthly contribution and target date - inline editable */}
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                {editingField === 'contribution' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs">€</span>
                    <Input
                      ref={contributionInputRef}
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="1"
                      value={editContributionValue}
                      onChange={(e) => setEditContributionValue(e.target.value)}
                      className="h-7 w-24 text-sm px-2"
                      disabled={isSaving}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveContribution();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCancelEdit();
                        }
                      }}
                    />
                    <span className="text-xs">/month</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={handleSaveContribution}
                      disabled={isSaving}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-xs hover:underline"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hover:text-foreground hover:underline"
                    onClick={() => handleStartEdit('contribution')}
                  >
                    {formatCurrency(goal.monthly_contribution, '€', false)}/month
                  </button>
                )}
                <span>•</span>
                {editingField === 'date' ? (
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-sm">
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          {editDateValue ? format(editDateValue, "MMM yyyy") : "Select"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editDateValue}
                          onSelect={(date) => {
                            setEditDateValue(date);
                            if (date) handleSaveDate(date);
                          }}
                          disabled={(date) => date < getMinDate()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      className="text-xs hover:underline"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hover:text-foreground hover:underline"
                    onClick={() => handleStartEdit('date')}
                  >
                    by {targetDateFormatted}
                  </button>
                )}
              </div>
            </SavingsGoalHeader>
          )}

          {/* Monthly chart toggle - clickable to expand */}
          <button
            type="button"
            className="w-full group mt-2"
            onClick={() => setShowMonthlyChart(!showMonthlyChart)}
          >
            <div className="flex items-center justify-center text-xs text-muted-foreground">
              <span>View monthly breakdown</span>
              {showMonthlyChart ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </div>
          </button>

          {/* Monthly bar chart - expandable */}
          {showMonthlyChart && (
            <div className="mt-4">
              <MonthlyOverviewChart goal={goal} onContributionUpdated={handleContributionUpdated} />
            </div>
          )}
        </div>

        {/* This Month's Contribution */}
        <div className="px-4">
          <Card
            className={cn(
              "cursor-pointer transition-colors",
              !isCompleted && "hover:bg-accent/50"
            )}
            onClick={() => !isCompleted && onCheckIn(goal.id)}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">This Month's Contribution</p>
              <div className="flex items-baseline justify-between">
                <p className={cn("text-2xl font-bold", getContributionColor())}>
                  {currentMonthContribution !== null
                    ? formatCurrency(currentMonthContribution, '€', false)
                    : 'Not recorded'}
                </p>
                <p className="text-sm text-muted-foreground">
                  of {formatCurrency(goal.monthly_contribution, '€', false)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats row */}
        <div className="px-4 mt-4 grid grid-cols-2 gap-3">
          <Card className={cn(
            "border-2 transition-colors",
            goal.current_streak > 0 ? "border-orange-500/50 bg-orange-500/5" : "border-muted"
          )}>
            <CardContent className="p-4 flex items-center gap-3">
              <Flame
                className={cn(
                  "w-7 h-7",
                  goal.current_streak > 0 ? "text-orange-500 fill-orange-500" : "text-muted-foreground"
                )}
              />
              <div>
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className={cn(
                  "font-bold text-lg",
                  goal.current_streak > 0 ? "text-orange-500" : "text-muted-foreground"
                )}>
                  {goal.current_streak} {goal.current_streak === 1 ? 'month' : 'months'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-2 transition-colors",
            goal.is_on_track ? "border-green-500/50 bg-green-500/5" : "border-yellow-500/50 bg-yellow-500/5"
          )}>
            <CardContent className="p-4 flex items-center gap-3">
              <Award
                className={cn(
                  "w-7 h-7",
                  goal.is_on_track ? "text-green-500" : "text-yellow-500"
                )}
              />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={cn(
                  "font-bold text-lg",
                  goal.is_on_track ? "text-green-500" : "text-yellow-500"
                )}>
                  {goal.is_on_track ? 'On Track' : 'Behind'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Months remaining & projected completion */}
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Months remaining</span>
                <span className="font-medium">{goal.months_remaining}</span>
              </div>
              {projectedDate && !isCompleted && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">At current pace</span>
                  <span className={cn(
                    "font-medium",
                    goal.is_on_track ? "text-green-600" : "text-yellow-600"
                  )}>
                    {projectedDate}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Why statement */}
        {goal.why_statement && (
          <div className="px-4 mt-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <p className="text-xs text-primary font-medium mb-1">WHY THIS MATTERS</p>
                <p className="text-sm italic">"{goal.why_statement}"</p>
              </CardContent>
            </Card>
          </div>
        )}

        </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Delete Goal?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete "{goal.name}"? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clear contributions confirmation modal (debug only) */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Clear Contributions?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This will delete all recorded contributions for "{goal.name}". The goal itself will remain.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleClearContributions}
                  disabled={isClearing}
                >
                  {isClearing ? 'Clearing...' : 'Clear'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
