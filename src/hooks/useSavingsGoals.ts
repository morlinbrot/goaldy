/**
 * useSavingsGoals Hook
 *
 * Provides reactive access to savings goals data with CRUD operations.
 */

import { useSavingsGoalsRepository } from '@/contexts/RepositoryContext';
import type { SavingsGoal, SavingsGoalWithStats } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';

interface UseSavingsGoalsOptions {
  withStats?: boolean;
}

interface UseSavingsGoalsReturn {
  goals: SavingsGoal[];
  goalsWithStats: SavingsGoalWithStats[];
  loading: boolean;
  error: string | null;

  // CRUD operations
  createGoal: (data: {
    name: string;
    target_amount: number;
    target_date: string;
    monthly_contribution: number;
    why_statement?: string | null;
    privacy_level?: 'private' | 'progress_only' | 'full';
  }) => Promise<SavingsGoal>;
  updateGoal: (id: string, changes: Partial<SavingsGoal>) => Promise<SavingsGoal | null>;
  deleteGoal: (id: string) => Promise<boolean>;

  // Utility methods
  getGoalWithStats: (id: string) => Promise<SavingsGoalWithStats | null>;
  getActive: () => Promise<SavingsGoal[]>;
  refresh: () => void;
}

export function useSavingsGoals(options: UseSavingsGoalsOptions = {}): UseSavingsGoalsReturn {
  const repo = useSavingsGoalsRepository();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [goalsWithStats, setGoalsWithStats] = useState<SavingsGoalWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { withStats } = options;

  // Subscribe to data changes
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = repo.subscribe(async (allGoals) => {
      try {
        setGoals(allGoals);

        if (withStats) {
          const statsData = await repo.getAllWithStats();
          setGoalsWithStats(statsData);
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load savings goals');
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [repo, withStats, refreshTrigger]);

  const createGoal = useCallback(async (data: {
    name: string;
    target_amount: number;
    target_date: string;
    monthly_contribution: number;
    why_statement?: string | null;
    privacy_level?: 'private' | 'progress_only' | 'full';
  }): Promise<SavingsGoal> => {
    return repo.create({
      name: data.name,
      target_amount: data.target_amount,
      target_date: data.target_date,
      monthly_contribution: data.monthly_contribution,
      why_statement: data.why_statement ?? null,
      privacy_level: data.privacy_level ?? 'private',
    });
  }, [repo]);

  const updateGoal = useCallback(async (
    id: string,
    changes: Partial<SavingsGoal>
  ): Promise<SavingsGoal | null> => {
    return repo.update(id, changes);
  }, [repo]);

  const deleteGoal = useCallback(async (id: string): Promise<boolean> => {
    return repo.delete(id);
  }, [repo]);

  const getGoalWithStats = useCallback(async (id: string): Promise<SavingsGoalWithStats | null> => {
    return repo.getWithStats(id);
  }, [repo]);

  const getActive = useCallback(async (): Promise<SavingsGoal[]> => {
    return repo.getActive();
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
    getActive,
    refresh,
  };
}
