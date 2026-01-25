/**
 * useExpenses Hook
 *
 * Provides reactive access to expenses data with CRUD operations.
 */

import { useExpensesRepository } from '@/contexts/RepositoryContext';
import type { Expense, ExpenseWithCategory } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';

interface UseExpensesOptions {
  month?: string;
  categoryId?: string;
  includeCategories?: boolean;
}

interface UseExpensesReturn {
  expenses: Expense[];
  expensesWithCategories: ExpenseWithCategory[];
  loading: boolean;
  error: string | null;

  // CRUD operations
  addExpense: (data: {
    amount: number;
    category_id: string | null;
    note: string | null;
    date: string;
  }) => Promise<Expense>;
  updateExpense: (id: string, changes: Partial<Expense>) => Promise<Expense | null>;
  deleteExpense: (id: string) => Promise<boolean>;

  // Utility methods
  getTotalForMonth: (month: string) => Promise<number>;
  getSpendingByCategory: (month: string) => Promise<{ category_id: string; total: number }[]>;
  refresh: () => void;
}

export function useExpenses(options: UseExpensesOptions = {}): UseExpensesReturn {
  const repo = useExpensesRepository();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesWithCategories, setExpensesWithCategories] = useState<ExpenseWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { month, categoryId, includeCategories } = options;

  // Subscribe to data changes
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = repo.subscribe(async (allExpenses) => {
      try {
        let filtered = allExpenses;

        // Apply filters
        if (month) {
          filtered = filtered.filter(e => e.date.startsWith(month));
        }
        if (categoryId) {
          filtered = filtered.filter(e => e.category_id === categoryId);
        }

        setExpenses(filtered);

        // Load with categories if requested
        if (includeCategories) {
          const withCategories = month
            ? await repo.getByMonthWithCategories(month)
            : await repo.getAllWithCategories();

          let filteredWithCategories = withCategories;
          if (categoryId) {
            filteredWithCategories = filteredWithCategories.filter(e => e.category_id === categoryId);
          }
          setExpensesWithCategories(filteredWithCategories);
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load expenses');
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [repo, month, categoryId, includeCategories, refreshTrigger]);

  const addExpense = useCallback(async (data: {
    amount: number;
    category_id: string | null;
    note: string | null;
    date: string;
  }): Promise<Expense> => {
    return repo.create({
      ...data,
      synced_at: null,
    });
  }, [repo]);

  const updateExpense = useCallback(async (
    id: string,
    changes: Partial<Expense>
  ): Promise<Expense | null> => {
    return repo.update(id, changes);
  }, [repo]);

  const deleteExpense = useCallback(async (id: string): Promise<boolean> => {
    return repo.delete(id);
  }, [repo]);

  const getTotalForMonth = useCallback(async (m: string): Promise<number> => {
    return repo.getTotalForMonth(m);
  }, [repo]);

  const getSpendingByCategory = useCallback(async (m: string) => {
    return repo.getSpendingByCategory(m);
  }, [repo]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    expenses,
    expensesWithCategories,
    loading,
    error,
    addExpense,
    updateExpense,
    deleteExpense,
    getTotalForMonth,
    getSpendingByCategory,
    refresh,
  };
}
