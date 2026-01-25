/**
 * useCategories Hook
 *
 * Provides reactive access to categories data with CRUD operations.
 */

import { useCategoriesRepository } from '@/contexts/RepositoryContext';
import type { Category } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';

interface UseCategoriesOptions {
  visibleOnly?: boolean;
  customOnly?: boolean;
}

interface UseCategoriesReturn {
  categories: Category[];
  loading: boolean;
  error: string | null;

  // CRUD operations
  createCategory: (data: {
    name: string;
    icon?: string | null;
    color?: string | null;
    is_hidden?: number;
    sort_order?: number | null;
  }) => Promise<Category>;
  updateCategory: (id: string, changes: Partial<Category>) => Promise<Category | null>;
  deleteCategory: (id: string) => Promise<boolean>;

  // Utility methods
  hideCategory: (id: string) => Promise<boolean>;
  showCategory: (id: string) => Promise<boolean>;
  updateSortOrder: (orderedIds: string[]) => Promise<void>;
  getByName: (name: string) => Promise<Category | null>;
  refresh: () => void;
}

export function useCategories(options: UseCategoriesOptions = {}): UseCategoriesReturn {
  const repo = useCategoriesRepository();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { visibleOnly, customOnly } = options;

  // Subscribe to data changes
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = repo.subscribe(async () => {
      try {
        let data: Category[];

        if (customOnly) {
          data = await repo.getCustom();
        } else if (visibleOnly) {
          data = await repo.getVisible();
        } else {
          data = await repo.getAll();
        }

        setCategories(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load categories');
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [repo, visibleOnly, customOnly, refreshTrigger]);

  const createCategory = useCallback(async (data: {
    name: string;
    icon?: string | null;
    color?: string | null;
    is_hidden?: number;
    sort_order?: number | null;
  }): Promise<Category> => {
    return repo.create({
      name: data.name,
      icon: data.icon ?? null,
      color: data.color ?? null,
      is_hidden: data.is_hidden ?? 0,
      sort_order: data.sort_order ?? null,
    });
  }, [repo]);

  const updateCategory = useCallback(async (
    id: string,
    changes: Partial<Category>
  ): Promise<Category | null> => {
    return repo.update(id, changes);
  }, [repo]);

  const deleteCategory = useCallback(async (id: string): Promise<boolean> => {
    return repo.delete(id);
  }, [repo]);

  const hideCategory = useCallback(async (id: string): Promise<boolean> => {
    return repo.hide(id);
  }, [repo]);

  const showCategory = useCallback(async (id: string): Promise<boolean> => {
    return repo.show(id);
  }, [repo]);

  const updateSortOrder = useCallback(async (orderedIds: string[]): Promise<void> => {
    return repo.updateSortOrder(orderedIds);
  }, [repo]);

  const getByName = useCallback(async (name: string): Promise<Category | null> => {
    return repo.getByName(name);
  }, [repo]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    categories,
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    hideCategory,
    showCategory,
    updateSortOrder,
    getByName,
    refresh,
  };
}
