/**
 * Sync Types
 *
 * Shared type definitions for the offline-first synchronization system.
 */

// Re-export entity types from lib/types for convenience
export type {
    Budget,
    Category,
    Expense,
    FeedbackNote,
    HabitGoal,
    HabitTracking,
    SavingsContribution,
    SavingsGoal
} from '@/lib/types';

// Sync operation types
export type SyncOperation = 'insert' | 'update' | 'delete';

// Sync status for UI
export type SyncStatusState = 'idle' | 'syncing' | 'error';

// Individual queue item (matches DB schema)
export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string; // JSON stringified
  user_id: string;
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
}

// Dead letter queue item (failed after max retries)
export interface DeadLetterItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  user_id: string;
  created_at: string;
  attempts: number;
  failed_at: string;
  final_error: string;
}

// Sync result for overall sync operation
export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
  deadLettered: number;
}

// Merge strategy options
export type MergeStrategy = 'last-write-wins' | 'local-wins' | 'remote-wins';

// Base entity interface (all syncable entities must have these)
export interface SyncableEntity {
  id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Listener types for observable pattern
export type DataListener<T> = (data: T[]) => void;
export type SyncStatusListener = (status: SyncStatusState, error?: string) => void;

// Sync configuration
export const SYNC_CONFIG = {
  DEBOUNCE_MS: 2000,           // Wait 2s after last change before pushing
  PERIODIC_SYNC_MS: 60000,     // Full sync every 60 seconds
  MAX_RETRY_ATTEMPTS: 3,       // Max retries before dead letter
  BASE_RETRY_DELAY_MS: 1000,   // Initial retry delay
  MAX_RETRY_DELAY_MS: 30000,   // Max retry delay (30s)
} as const;

// Table names for type safety
export const SYNC_TABLES = {
  CATEGORIES: 'categories',
  SAVINGS_GOALS: 'savings_goals',
  HABIT_GOALS: 'habit_goals',
  BUDGETS: 'budgets',
  EXPENSES: 'expenses',
  SAVINGS_CONTRIBUTIONS: 'savings_contributions',
  HABIT_TRACKING: 'habit_tracking',
  FEEDBACK_NOTES: 'feedback_notes',
  NOTIFICATION_PREFERENCES: 'notification_preferences',
  SCHEDULED_NOTIFICATIONS: 'scheduled_notifications',
} as const;

export type SyncTableName = typeof SYNC_TABLES[keyof typeof SYNC_TABLES];

// FK dependency order for sync operations
export const SYNC_TABLE_ORDER: SyncTableName[] = [
  SYNC_TABLES.CATEGORIES,
  SYNC_TABLES.SAVINGS_GOALS,
  SYNC_TABLES.HABIT_GOALS,
  SYNC_TABLES.BUDGETS,
  SYNC_TABLES.EXPENSES,
  SYNC_TABLES.SAVINGS_CONTRIBUTIONS,
  SYNC_TABLES.HABIT_TRACKING,
  SYNC_TABLES.FEEDBACK_NOTES,
  SYNC_TABLES.NOTIFICATION_PREFERENCES,
  SYNC_TABLES.SCHEDULED_NOTIFICATIONS,
];

// Utility to calculate retry delay with exponential backoff
export function getRetryDelay(attempt: number): number {
  const delay = SYNC_CONFIG.BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, SYNC_CONFIG.MAX_RETRY_DELAY_MS);
}
