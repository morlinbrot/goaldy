/**
 * RepositoryContext
 *
 * Provides singleton repository instances to the React application.
 * All repositories share a single SyncService for coordinated sync operations.
 */

import {
    BudgetsRepository,
    CategoriesRepository,
    ExpensesRepository,
    FeedbackNotesRepository,
    HabitGoalsRepository,
    HabitTrackingRepository,
    NotificationPreferencesRepository,
    SavingsContributionsRepository,
    SavingsGoalsRepository,
    ScheduledNotificationsRepository,
} from '@/lib/sync/repositories';
import { getSyncService, type SyncService } from '@/lib/sync/services/SyncService';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface RepositoryContextValue {
  // Core repositories
  expenses: ExpensesRepository;
  budgets: BudgetsRepository;
  categories: CategoriesRepository;

  // Savings repositories
  savingsGoals: SavingsGoalsRepository;
  savingsContributions: SavingsContributionsRepository;

  // Habit repositories
  habitGoals: HabitGoalsRepository;
  habitTracking: HabitTrackingRepository;

  // Other repositories
  feedbackNotes: FeedbackNotesRepository;
  notificationPreferences: NotificationPreferencesRepository;
  scheduledNotifications: ScheduledNotificationsRepository;

  // Sync service
  syncService: SyncService;

  // Loading state
  isInitialized: boolean;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

interface RepositoryProviderProps {
  children: ReactNode;
}

/**
 * Create all repository instances with a shared SyncService.
 */
function createRepositories(syncService: SyncService): Omit<RepositoryContextValue, 'isInitialized'> {
  const expenses = new ExpensesRepository(syncService);
  const budgets = new BudgetsRepository(syncService);
  const categories = new CategoriesRepository(syncService);
  const savingsGoals = new SavingsGoalsRepository(syncService);
  const savingsContributions = new SavingsContributionsRepository(syncService);
  const habitGoals = new HabitGoalsRepository(syncService);
  const habitTracking = new HabitTrackingRepository(syncService);
  const feedbackNotes = new FeedbackNotesRepository(syncService);
  const notificationPreferences = new NotificationPreferencesRepository(syncService);
  const scheduledNotifications = new ScheduledNotificationsRepository(syncService);

  // Register all repositories with the sync service
  syncService.registerRepository(expenses);
  syncService.registerRepository(budgets);
  syncService.registerRepository(categories);
  syncService.registerRepository(savingsGoals);
  syncService.registerRepository(savingsContributions);
  syncService.registerRepository(habitGoals);
  syncService.registerRepository(habitTracking);
  syncService.registerRepository(feedbackNotes);
  syncService.registerRepository(notificationPreferences);
  syncService.registerRepository(scheduledNotifications);

  return {
    expenses,
    budgets,
    categories,
    savingsGoals,
    savingsContributions,
    habitGoals,
    habitTracking,
    feedbackNotes,
    notificationPreferences,
    scheduledNotifications,
    syncService,
  };
}

export function RepositoryProvider({ children }: RepositoryProviderProps) {
  const [repos, setRepos] = useState<Omit<RepositoryContextValue, 'isInitialized'> | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Create repositories on mount
    const syncService = getSyncService();
    const repositories = createRepositories(syncService);

    // Initialize sync service
    syncService.initialize();

    setRepos(repositories);
    setIsInitialized(true);

    // Cleanup on unmount
    return () => {
      syncService.destroy();
    };
  }, []);

  if (!repos) {
    // Still initializing
    return null;
  }

  const value: RepositoryContextValue = {
    ...repos,
    isInitialized,
  };

  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

/**
 * Hook to access all repositories.
 */
export function useRepositories(): RepositoryContextValue {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepositories must be used within a RepositoryProvider');
  }
  return context;
}

/**
 * Hook to access the sync service.
 */
export function useSyncService(): SyncService {
  const { syncService } = useRepositories();
  return syncService;
}

// ============ Individual Repository Hooks ============

export function useExpensesRepository(): ExpensesRepository {
  const { expenses } = useRepositories();
  return expenses;
}

export function useBudgetsRepository(): BudgetsRepository {
  const { budgets } = useRepositories();
  return budgets;
}

export function useCategoriesRepository(): CategoriesRepository {
  const { categories } = useRepositories();
  return categories;
}

export function useSavingsGoalsRepository(): SavingsGoalsRepository {
  const { savingsGoals } = useRepositories();
  return savingsGoals;
}

export function useSavingsContributionsRepository(): SavingsContributionsRepository {
  const { savingsContributions } = useRepositories();
  return savingsContributions;
}

export function useHabitGoalsRepository(): HabitGoalsRepository {
  const { habitGoals } = useRepositories();
  return habitGoals;
}

export function useHabitTrackingRepository(): HabitTrackingRepository {
  const { habitTracking } = useRepositories();
  return habitTracking;
}

export function useFeedbackNotesRepository(): FeedbackNotesRepository {
  const { feedbackNotes } = useRepositories();
  return feedbackNotes;
}

export function useNotificationPreferencesRepository(): NotificationPreferencesRepository {
  const { notificationPreferences } = useRepositories();
  return notificationPreferences;
}

export function useScheduledNotificationsRepository(): ScheduledNotificationsRepository {
  const { scheduledNotifications } = useRepositories();
  return scheduledNotifications;
}
