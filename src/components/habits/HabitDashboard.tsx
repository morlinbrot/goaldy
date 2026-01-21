import { AppHeader } from "@/components/AppHeader";
import { Confetti } from "@/components/goals/Confetti";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteHabitGoal, getHabitTrackingForGoal, updateHabitGoal } from "@/lib/database";
import { formatCurrency, type HabitGoalWithStats, type HabitTracking } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, CheckCircle, Flame, Trash2, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface HabitDashboardProps {
  habit: HabitGoalWithStats;
  onBack: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

export function HabitDashboard({ habit, onBack, onDeleted, onUpdated }: HabitDashboardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState<HabitTracking[]>([]);

  // Edit states
  const [editingField, setEditingField] = useState<'name' | 'rule_value' | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editRuleValue, setEditRuleValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const ruleInputRef = useRef<HTMLInputElement>(null);

  const loadTrackingHistory = useCallback(async () => {
    try {
      const history = await getHabitTrackingForGoal(habit.id);
      setTrackingHistory(history);
    } catch (error) {
      console.error('Failed to load tracking history:', error);
    }
  }, [habit.id]);

  useEffect(() => {
    loadTrackingHistory();
  }, [loadTrackingHistory]);

  // Focus input when editing
  useEffect(() => {
    if (editingField === 'name' && nameInputRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 100);
    }
    if (editingField === 'rule_value' && ruleInputRef.current) {
      setTimeout(() => {
        ruleInputRef.current?.focus();
        ruleInputRef.current?.select();
      }, 100);
    }
  }, [editingField]);

  // Show confetti when compliant at end of month (streak milestone)
  useEffect(() => {
    if (habit.is_compliant && habit.current_streak > 0 && habit.current_streak % 3 === 0) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    }
  }, [habit.is_compliant, habit.current_streak]);

  const handleStartEdit = (field: 'name' | 'rule_value') => {
    if (field === 'name') {
      setEditNameValue(habit.name);
    } else {
      setEditRuleValue(habit.rule_value.toString());
    }
    setEditingField(field);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditNameValue('');
    setEditRuleValue('');
  };

  const handleSaveName = async () => {
    if (!editNameValue.trim()) return;

    setIsSaving(true);
    try {
      await updateHabitGoal(habit.id, { name: editNameValue.trim() });
      setEditingField(null);
      setEditNameValue('');
      onUpdated();
    } catch (error) {
      console.error('Failed to update name:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRuleValue = async () => {
    const newValue = parseFloat(editRuleValue);
    if (isNaN(newValue) || newValue <= 0) return;

    setIsSaving(true);
    try {
      await updateHabitGoal(habit.id, { rule_value: newValue });
      setEditingField(null);
      setEditRuleValue('');
      onUpdated();
    } catch (error) {
      console.error('Failed to update rule value:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteHabitGoal(habit.id);
      onDeleted();
    } catch (error) {
      console.error('Failed to delete habit goal:', error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Get status colors
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
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'exceeded':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
  };

  const getRuleTypeLabel = () => {
    switch (habit.rule_type) {
      case 'max_amount':
        return 'Maximum Amount';
      case 'max_percentage':
        return 'Maximum Percentage';
      case 'reduce_by':
        return 'Reduce By';
    }
  };

  const formatRuleValue = () => {
    switch (habit.rule_type) {
      case 'max_amount':
        return formatCurrency(habit.rule_value, '€', false);
      case 'max_percentage':
        return `${habit.rule_value}%`;
      case 'reduce_by':
        return `${habit.rule_value}%`;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {showConfetti && <Confetti />}

      {/* Header */}
      <AppHeader title={habit.name} onBack={onBack}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-5 h-5" />
        </Button>
      </AppHeader>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Progress section */}
        <div className="p-4">
          {/* Category badge */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
              style={{ backgroundColor: habit.category_color || '#64748b' }}
            >
              {habit.category_icon || '📦'}
            </span>
            <span className="text-sm font-medium">{habit.category_name || 'Unknown Category'}</span>
          </div>

          {/* Main spending display */}
          <div className="text-center mb-4">
            <p className={cn("text-4xl font-bold", getStatusColor())}>
              {formatCurrency(habit.current_month_spent, '€', false)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              of {formatCurrency(habit.current_month_target, '€', false)} limit
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", getStatusBgColor())}
                style={{ width: `${Math.min(100, habit.percentage_used)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{Math.round(habit.percentage_used)}% used</span>
              <span>
                {habit.current_month_target - habit.current_month_spent > 0
                  ? `${formatCurrency(habit.current_month_target - habit.current_month_spent, '€', false)} remaining`
                  : `${formatCurrency(habit.current_month_spent - habit.current_month_target, '€', false)} over`}
              </span>
            </div>
          </div>

          {/* Status message */}
          <Card className={cn(
            "border-2",
            habit.status === 'safe' && "border-green-500/50 bg-green-500/5",
            habit.status === 'warning' && "border-yellow-500/50 bg-yellow-500/5",
            habit.status === 'exceeded' && "border-red-500/50 bg-red-500/5"
          )}>
            <CardContent className="p-4 flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <p className={cn("font-medium", getStatusColor())}>
                  {habit.status === 'safe' && 'On Track'}
                  {habit.status === 'warning' && 'Approaching Limit'}
                  {habit.status === 'exceeded' && 'Limit Exceeded'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {habit.status === 'safe' && 'Keep up the great work!'}
                  {habit.status === 'warning' && 'Be mindful of your spending.'}
                  {habit.status === 'exceeded' && 'Consider adjusting your spending.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats row */}
        <div className="px-4 grid grid-cols-2 gap-3">
          <Card className={cn(
            "border-2 transition-colors",
            habit.current_streak > 0 ? "border-orange-500/50 bg-orange-500/5" : "border-muted"
          )}>
            <CardContent className="p-4 flex items-center gap-3">
              <Flame
                className={cn(
                  "w-7 h-7",
                  habit.current_streak > 0 ? "text-orange-500 fill-orange-500" : "text-muted-foreground"
                )}
              />
              <div>
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className={cn(
                  "font-bold text-lg",
                  habit.current_streak > 0 ? "text-orange-500" : "text-muted-foreground"
                )}>
                  {habit.current_streak} {habit.current_streak === 1 ? 'month' : 'months'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-muted">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingDown className="w-7 h-7 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{getRuleTypeLabel()}</p>
                {editingField === 'rule_value' ? (
                  <div className="flex items-center gap-1">
                    <Input
                      ref={ruleInputRef}
                      type="number"
                      inputMode="decimal"
                      value={editRuleValue}
                      onChange={(e) => setEditRuleValue(e.target.value)}
                      className="h-6 w-16 text-sm px-1"
                      disabled={isSaving}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveRuleValue();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCancelEdit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs text-primary"
                      onClick={handleSaveRuleValue}
                      disabled={isSaving}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="font-bold text-lg hover:text-primary hover:underline"
                    onClick={() => handleStartEdit('rule_value')}
                  >
                    {formatRuleValue()}
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Habit name (editable) */}
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Habit Name</span>
                {editingField === 'name' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={nameInputRef}
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      className="h-6 w-40 text-sm px-2"
                      disabled={isSaving}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveName();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCancelEdit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs text-primary"
                      onClick={handleSaveName}
                      disabled={isSaving}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-xs"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="font-medium hover:text-primary hover:underline"
                    onClick={() => handleStartEdit('name')}
                  >
                    {habit.name}
                  </button>
                )}
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium">
                  {new Date(habit.start_date).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tracking History */}
        {trackingHistory.length > 0 && (
          <div className="px-4 mt-4 pb-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">History</h3>
            <div className="space-y-2">
              {trackingHistory.slice(0, 6).map((tracking) => (
                <Card key={tracking.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {tracking.is_compliant === 1 ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {new Date(tracking.month + '-01').toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "text-sm font-medium",
                        tracking.is_compliant === 1 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(tracking.spent_amount, '€', false)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        / {formatCurrency(tracking.target_amount, '€', false)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Delete Habit Goal?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete "{habit.name}"? This action cannot be undone.
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
    </div>
  );
}
