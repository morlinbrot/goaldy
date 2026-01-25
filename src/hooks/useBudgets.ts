/**
 * useBudgets Hook
 *
 * Provides reactive access to budgets data with CRUD operations.
 */

import { useBudgetsRepository } from '@/contexts/RepositoryContext';
import { type Budget } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';

interface UseBudgetsReturn {
  budgets: Budget[];
  currentBudget: Budget | null;
  loading: boolean;
  error: string | null;

  // CRUD operations
  createBudget: (data: {
    month: string;
    total_amount: number;
    spending_limit?: number | null;
  }) => Promise<Budget>;
  updateBudget: (id: string, changes: Partial<Budget>) => Promise<Budget | null>;
  deleteBudget: (id: string) => Promise<boolean>;

  // Utility methods
  getByMonth: (month: string) => Promise<Budget | null>;
  upsertForMonth: (month: string, data: { total_amount: number; spending_limit?: number | null }) => Promise<Budget>;
  refresh: () => void;
}

export function useBudgets(): UseBudgetsReturn {
  const repo = useBudgetsRepository();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Subscribe to data changes
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = repo.subscribe(async (allBudgets) => {
      try {
        setBudgets(allBudgets);

        // Get current month's budget
        const current = await repo.getCurrentBudget();
        setCurrentBudget(current);

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load budgets');
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [repo, refreshTrigger]);

  const createBudget = useCallback(async (data: {
    month: string;
    total_amount: number;
    spending_limit?: number | null;
  }): Promise<Budget> => {
    return repo.create({
      month: data.month,
      total_amount: data.total_amount,
      spending_limit: data.spending_limit ?? null,
    });
  }, [repo]);

  const updateBudget = useCallback(async (
    id: string,
    changes: Partial<Budget>
  ): Promise<Budget | null> => {
    return repo.update(id, changes);
  }, [repo]);

  const deleteBudget = useCallback(async (id: string): Promise<boolean> => {
    return repo.delete(id);
  }, [repo]);

  const getByMonth = useCallback(async (month: string): Promise<Budget | null> => {
    return repo.getByMonth(month);
  }, [repo]);

  const upsertForMonth = useCallback(async (
    month: string,
    data: { total_amount: number; spending_limit?: number | null }
  ): Promise<Budget> => {
    return repo.upsertForMonth(month, data);
  }, [repo]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    budgets,
    currentBudget,
    loading,
    error,
    createBudget,
    updateBudget,
    deleteBudget,
    getByMonth,
    upsertForMonth,
    refresh,
  };
}
