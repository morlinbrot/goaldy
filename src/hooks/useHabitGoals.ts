/**
 * useHabitGoals Hook
 *
 * Provides reactive access to habit goals data with CRUD operations.
 */

import { useHabitGoalsRepository } from '@/contexts/RepositoryContext';
import { getCurrentMonth, type HabitGoal, type HabitGoalWithStats } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';

interface UseHabitGoalsOptions {
  withStats?: boolean;
  activeOnly?: boolean;
}

interface UseHabitGoalsReturn {
  goals: HabitGoal[];
  goalsWithStats: HabitGoalWithStats[];
  loading: boolean;
  error: string | null;

  // CRUD operations
  createGoal: (data: {
    name: string;
    category_id: string;
    rule_type: 'max_amount' | 'max_percentage' | 'reduce_by';
    rule_value: number;
    duration_months?: number | null;
    start_date: string;
    privacy_level?: 'private' | 'progress_only' | 'full';
  }) => Promise<HabitGoal>;
  updateGoal: (id: string, changes: Partial<HabitGoal>) => Promise<HabitGoal | null>;
  deleteGoal: (id: string) => Promise<boolean>;

  // Utility methods
  getGoalWithStats: (id: string) => Promise<HabitGoalWithStats | null>;
  getByCategory: (categoryId: string) => Promise<HabitGoal[]>;
  hasActiveGoalForCategory: (categoryId: string) => Promise<boolean>;
  refresh: () => void;
}

export function useHabitGoals(options: UseHabitGoalsOptions = {}): UseHabitGoalsReturn {
  const repo = useHabitGoalsRepository();
  const [goals, setGoals] = useState<HabitGoal[]>([]);
  const [goalsWithStats, setGoalsWithStats] = useState<HabitGoalWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { withStats, activeOnly } = options;

  // Subscribe to data changes
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = repo.subscribe(async () => {
      try {
        const data = activeOnly ? await repo.getActive() : await repo.getAll();
        setGoals(data);

        if (withStats) {
          const currentMonth = getCurrentMonth();
          const statsData = await repo.getAllWithStats(currentMonth);
          setGoalsWithStats(activeOnly
            ? statsData
            : statsData
          );
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load habit goals');
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [repo, withStats, activeOnly, refreshTrigger]);

  const createGoal = useCallback(async (data: {
    name: string;
    category_id: string;
    rule_type: 'max_amount' | 'max_percentage' | 'reduce_by';
    rule_value: number;
    duration_months?: number | null;
    start_date: string;
    privacy_level?: 'private' | 'progress_only' | 'full';
  }): Promise<HabitGoal> => {
    return repo.create({
      name: data.name,
      category_id: data.category_id,
      rule_type: data.rule_type,
      rule_value: data.rule_value,
      duration_months: data.duration_months ?? null,
      start_date: data.start_date,
      privacy_level: data.privacy_level ?? 'private',
    });
  }, [repo]);

  const updateGoal = useCallback(async (
    id: string,
    changes: Partial<HabitGoal>
  ): Promise<HabitGoal | null> => {
    return repo.update(id, changes);
  }, [repo]);

  const deleteGoal = useCallback(async (id: string): Promise<boolean> => {
    return repo.delete(id);
  }, [repo]);

  const getGoalWithStats = useCallback(async (id: string): Promise<HabitGoalWithStats | null> => {
    const currentMonth = getCurrentMonth();
    return repo.getWithStats(id, currentMonth);
  }, [repo]);

  const getByCategory = useCallback(async (categoryId: string): Promise<HabitGoal[]> => {
    return repo.getByCategory(categoryId);
  }, [repo]);

  const hasActiveGoalForCategory = useCallback(async (categoryId: string): Promise<boolean> => {
    return repo.hasActiveGoalForCategory(categoryId);
  }, [repo]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    goals,
    goalsWithStats,
    loading,
    error,
    createGoal,
    updateGoal,
    deleteGoal,
    getGoalWithStats,
    getByCategory,
    hasActiveGoalForCategory,
    refresh,
  };
}
