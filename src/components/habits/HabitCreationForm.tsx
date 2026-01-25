import { AppHeader } from "@/components/AppHeader";
import { CategorySelector } from "@/components/CategorySelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCategoriesRepository, useHabitGoalsRepository } from "@/contexts/RepositoryContext";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface HabitCreationFormProps {
  onHabitCreated: () => void;
  onBack: () => void;
}

type RuleType = 'max_amount' | 'max_percentage' | 'reduce_by';

const ruleTypeOptions: { value: RuleType; label: string; description: string }[] = [
  {
    value: 'max_amount',
    label: 'Maximum Amount',
    description: 'Spend no more than a fixed amount per month',
  },
  {
    value: 'max_percentage',
    label: 'Maximum Percentage',
    description: 'Keep spending under a percentage of total monthly expenses',
  },
  {
    value: 'reduce_by',
    label: 'Reduce By',
    description: 'Reduce spending by a percentage compared to last month',
  },
];

export function HabitCreationForm({ onHabitCreated, onBack }: HabitCreationFormProps) {
  const categoriesRepository = useCategoriesRepository();
  const habitGoalsRepository = useHabitGoalsRepository();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>('max_amount');
  const [ruleValue, setRuleValue] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await categoriesRepository.getAll();
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCategories();
  }, [categoriesRepository]);

  // Auto-generate name based on category and rule
  useEffect(() => {
    if (categoryId && ruleValue) {
      const category = categories.find(c => c.id === categoryId);
      if (category) {
        let generatedName = '';
        switch (ruleType) {
          case 'max_amount':
            generatedName = `${category.name} under ${ruleValue}`;
            break;
          case 'max_percentage':
            generatedName = `${category.name} under ${ruleValue}%`;
            break;
          case 'reduce_by':
            generatedName = `Reduce ${category.name} by ${ruleValue}%`;
            break;
        }
        setName(generatedName);
      }
    }
  }, [categoryId, ruleType, ruleValue, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!categoryId) {
      setError('Please select a category');
      return;
    }

    const value = parseFloat(ruleValue);
    if (isNaN(value) || value <= 0) {
      setError('Please enter a valid amount or percentage');
      return;
    }

    if (ruleType === 'max_percentage' && value > 100) {
      setError('Percentage cannot exceed 100%');
      return;
    }

    if (ruleType === 'reduce_by' && value > 100) {
      setError('Reduction percentage cannot exceed 100%');
      return;
    }

    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await habitGoalsRepository.create({
        name: name.trim() || `${categories.find(c => c.id === categoryId)?.name || 'Category'} habit`,
        category_id: categoryId,
        rule_type: ruleType,
        rule_value: value,
        duration_months: null,
        start_date: today,
        privacy_level: 'private',
      });
      onHabitCreated();
    } catch (err) {
      console.error('Failed to create habit goal:', err);
      setError('Failed to create habit goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRuleValueLabel = () => {
    switch (ruleType) {
      case 'max_amount':
        return 'Maximum Amount';
      case 'max_percentage':
        return 'Maximum Percentage';
      case 'reduce_by':
        return 'Reduction Percentage';
    }
  };

  const getRuleValuePlaceholder = () => {
    switch (ruleType) {
      case 'max_amount':
        return '200';
      case 'max_percentage':
        return '15';
      case 'reduce_by':
        return '20';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <AppHeader title="New Habit Goal" onBack={onBack} />

      {/* Form */}
      <div className="flex-1 overflow-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Set a spending limit</CardTitle>
            <CardDescription>
              Create a habit to control spending in a specific category.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Category Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Category
                </label>
                <CategorySelector
                  categories={categories}
                  selected={categoryId}
                  onSelect={setCategoryId}
                />
              </div>

              {/* Rule Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Rule Type
                </label>
                <div className="grid gap-2">
                  {ruleTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRuleType(option.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-colors",
                        ruleType === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rule Value */}
              <div className="space-y-2">
                <label htmlFor="ruleValue" className="text-sm font-medium">
                  {getRuleValueLabel()}
                </label>
                <div className="relative">
                  {ruleType === 'max_amount' && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      €
                    </span>
                  )}
                  <Input
                    id="ruleValue"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                    placeholder={getRuleValuePlaceholder()}
                    className={ruleType === 'max_amount' ? 'pl-8' : ''}
                    disabled={isSubmitting}
                  />
                  {ruleType !== 'max_amount' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      %
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ruleType === 'max_amount' && 'The maximum amount you want to spend on this category each month.'}
                  {ruleType === 'max_percentage' && 'The maximum percentage of your total monthly spending for this category.'}
                  {ruleType === 'reduce_by' && 'How much less you want to spend compared to the previous month.'}
                </p>
              </div>

              {/* Habit Name (Auto-generated but editable) */}
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Habit Name <span className="text-muted-foreground">(auto-generated)</span>
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Dining under €200"
                  disabled={isSubmitting}
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              {/* Submit */}
              <Button type="submit" className="w-full" disabled={isSubmitting || !categoryId}>
                {isSubmitting ? 'Creating...' : 'Create Habit Goal'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
