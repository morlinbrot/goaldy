/**
 * Sync Module Public API
 *
 * This module provides an offline-first synchronization system for the app.
 *
 * Architecture:
 * - Local SQLite database is the source of truth for all reads
 * - Writes go to local first, then queue for remote sync
 * - Bidirectional sync with Supabase PostgreSQL
 * - Last-write-wins conflict resolution
 *
 * Usage:
 * 1. Wrap your app with RepositoryProvider and SyncProvider
 * 2. Use repository hooks (useExpenses, useBudgets, etc.) for data access
 * 3. Use useSync() for sync status and manual sync triggers
 */

// Types
export type {
    DataListener,
    DeadLetterItem,
    MergeStrategy,
    SyncableEntity,
    SyncOperation,
    SyncQueueItem,
    SyncResult,
    SyncStatusListener,
    SyncStatusState,
    SyncTableName
} from './types';

export {
    getRetryDelay,
    SYNC_CONFIG,
    SYNC_TABLE_ORDER,
    SYNC_TABLES
} from './types';

// Services
export { SyncQueue } from './services/SyncQueue';
export { getSyncService, SyncService, type SyncableRepository } from './services/SyncService';

// Data Sources
export { LocalDataSource } from './datasources/LocalDataSource';
export { RemoteDataSource } from './datasources/RemoteDataSource';
export type { LocalDataSource as ILocalDataSource, RemoteDataSource as IRemoteDataSource } from './datasources/types';

// Repositories
export {
    BaseRepository,
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
    type NotificationPreferences,
    type ScheduledNotification
} from './repositories';

