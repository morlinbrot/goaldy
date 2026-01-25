/**
 * SyncService
 *
 * Central orchestrator for all sync operations:
 * - Online/offline status tracking
 * - Debounced push scheduling
 * - Periodic sync execution
 * - Coordination of pull/push across repositories
 */

import { getCurrentUserId, getFullSession, getLocalAuthState, updateLastSyncAt } from '@/lib/auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
    SYNC_CONFIG,
    SYNC_TABLE_ORDER,
    SyncResult,
    SyncStatusListener,
    SyncStatusState,
    SyncTableName
} from '../types';
import { SyncQueue } from './SyncQueue';

// Interface that repositories must implement to participate in sync
export interface SyncableRepository {
  readonly tableName: SyncTableName;

  // Pull changes from remote and merge into local
  pull(since: string | null): Promise<number>;

  // Push a single queued item to remote
  push(recordId: string, operation: string, payload: object): Promise<void>;
}

export class SyncService {
  private isOnlineInner: boolean = true;
  private isSyncingInner: boolean = false;
  private lastSyncAtInner: string | null = null;

  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicSyncInterval: ReturnType<typeof setInterval> | null = null;

  private statusListeners: Set<SyncStatusListener> = new Set();
  private repositories: Map<SyncTableName, SyncableRepository> = new Map();

  private syncQueue: SyncQueue;

  constructor() {
    this.syncQueue = new SyncQueue();
  }

  /**
   * Initialize the sync service.
   * Call this once when the app starts.
   */
  initialize(): void {
    // Set initial online status
    this.isOnlineInner = navigator.onLine;

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Load last sync timestamp
    this.loadLastSyncAt();

    // Start periodic sync
    this.startPeriodicSync();
  }

  /**
   * Cleanup the sync service.
   * Call this when the app is unmounting.
   */
  destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
      this.pushDebounceTimer = null;
    }

    if (this.periodicSyncInterval) {
      clearInterval(this.periodicSyncInterval);
      this.periodicSyncInterval = null;
    }

    this.statusListeners.clear();
    this.repositories.clear();
  }

  // ============ Status Getters ============

  get isOnline(): boolean {
    return this.isOnlineInner;
  }

  get isSyncing(): boolean {
    return this.isSyncingInner;
  }

  get lastSyncAt(): string | null {
    return this.lastSyncAtInner;
  }

  // ============ Repository Registration ============

  /**
   * Register a repository to participate in sync.
   * Must be called for each entity repository.
   */
  registerRepository(repository: SyncableRepository): void {
    this.repositories.set(repository.tableName, repository);
  }

  /**
   * Unregister a repository.
   */
  unregisterRepository(tableName: SyncTableName): void {
    this.repositories.delete(tableName);
  }

  /**
   * Get the sync queue instance (for repositories to enqueue changes).
   */
  getSyncQueue(): SyncQueue {
    return this.syncQueue;
  }

  // ============ Sync Triggers ============

  /**
   * Schedule a push operation with debouncing.
   * Called by repositories after local writes.
   */
  schedulePush(): void {
    if (!this.isOnlineInner) return;

    // Clear existing timer
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
    }

    // Set new debounced timer
    this.pushDebounceTimer = setTimeout(() => {
      this.pushPendingChanges().catch(console.error);
      this.pushDebounceTimer = null;
    }, SYNC_CONFIG.DEBOUNCE_MS);
  }

  /**
   * Perform a full sync: pull then push.
   */
  async fullSync(): Promise<SyncResult> {
    if (this.isSyncingInner) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        errors: ['Sync already in progress'],
        deadLettered: 0,
      };
    }

    if (!this.canSync()) {
      return {
        success: true,
        pushed: 0,
        pulled: 0,
        errors: [],
        deadLettered: 0,
      };
    }

    this.isSyncingInner = true;
    this.notifyStatusListeners('syncing');

    const result: SyncResult = {
      success: true,
      pushed: 0,
      pulled: 0,
      errors: [],
      deadLettered: 0,
    };

    try {
      // Pull first (get remote changes)
      const pullResult = await this.pullChanges();
      result.pulled = pullResult.pulled;
      result.errors.push(...pullResult.errors);
      if (!pullResult.success) {
        result.success = false;
      }

      // Then push (send local changes)
      const pushResult = await this.pushPendingChanges();
      result.pushed = pushResult.pushed;
      result.deadLettered = pushResult.deadLettered;
      result.errors.push(...pushResult.errors);
      if (!pushResult.success) {
        result.success = false;
      }

      // Update last sync timestamp
      if (result.success || (result.pulled > 0 || result.pushed > 0)) {
        const now = new Date().toISOString();
        await updateLastSyncAt(now);
        this.lastSyncAtInner = now;
      }

      this.notifyStatusListeners(result.success ? 'idle' : 'error',
        result.errors.length > 0 ? result.errors[0] : undefined);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      result.success = false;
      result.errors.push(errorMessage);
      this.notifyStatusListeners('error', errorMessage);
    } finally {
      this.isSyncingInner = false;
    }

    return result;
  }

  /**
   * Pull changes from remote for all registered repositories.
   */
  async pullChanges(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      pushed: 0,
      pulled: 0,
      errors: [],
      deadLettered: 0,
    };

    if (!this.canSync()) {
      return result;
    }

    const since = this.lastSyncAtInner;

    // Pull in FK dependency order
    for (const tableName of SYNC_TABLE_ORDER) {
      const repository = this.repositories.get(tableName);
      if (!repository) continue;

      try {
        const pulledCount = await repository.pull(since);
        result.pulled += pulledCount;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Pull ${tableName} failed: ${errorMessage}`);
        // Continue with other tables
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * Push pending changes from the sync queue.
   */
  async pushPendingChanges(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      pushed: 0,
      pulled: 0,
      errors: [],
      deadLettered: 0,
    };

    if (!this.canSync()) {
      return result;
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return result;
    }

    // Get pending items (already ordered by FK dependencies)
    const items = await this.syncQueue.getPendingItems(userId);

    for (const item of items) {
      const repository = this.repositories.get(item.table_name as SyncTableName);

      if (!repository) {
        // No repository for this table, skip
        console.warn(`No repository registered for table: ${item.table_name}`);
        continue;
      }

      try {
        const payload = JSON.parse(item.payload);
        await repository.push(item.record_id, item.operation, payload);
        await this.syncQueue.markComplete(item.id);
        result.pushed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Check if this is a retryable error
        if (this.isRetryableError(error)) {
          const deadLettered = await this.syncQueue.markFailed(item.id, errorMessage);
          if (deadLettered) {
            result.deadLettered++;
            result.errors.push(`${item.table_name}/${item.record_id}: moved to dead letter queue`);
          }
        } else {
          // Non-retryable error (e.g., 401, 400) - immediately dead letter
          await this.syncQueue.moveToDeadLetter(item, errorMessage);
          result.deadLettered++;
          result.errors.push(`${item.table_name}/${item.record_id}: ${errorMessage}`);
        }
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;
  }

  // ============ Status Subscriptions ============

  /**
   * Subscribe to sync status changes.
   */
  onStatusChange(listener: SyncStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  // ============ Utility Methods ============

  /**
   * Get the current pending changes count.
   */
  async getPendingCount(): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;
    return this.syncQueue.getPendingCount(userId);
  }

  /**
   * Get the current dead letter count.
   */
  async getDeadLetterCount(): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;
    return this.syncQueue.getDeadLetterCount(userId);
  }

  /**
   * Retry all dead letter items.
   */
  async retryAllDeadLetters(): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    const items = await this.syncQueue.getDeadLetterItems(userId);
    let retried = 0;

    for (const item of items) {
      try {
        await this.syncQueue.retryDeadLetter(item.id);
        retried++;
      } catch (error) {
        console.error(`Failed to retry dead letter ${item.id}:`, error);
      }
    }

    // Trigger a push if any items were retried
    if (retried > 0) {
      this.schedulePush();
    }

    return retried;
  }

  // ============ Private Methods ============

  private handleOnline = (): void => {
    this.isOnlineInner = true;
    // Trigger sync when coming back online
    this.fullSync().catch(console.error);
  };

  private handleOffline = (): void => {
    this.isOnlineInner = false;
    // Cancel any pending push
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
      this.pushDebounceTimer = null;
    }
  };

  private startPeriodicSync(): void {
    this.periodicSyncInterval = setInterval(() => {
      if (this.isOnlineInner && !this.isSyncingInner) {
        this.fullSync().catch(console.error);
      }
    }, SYNC_CONFIG.PERIODIC_SYNC_MS);
  }

  private async loadLastSyncAt(): Promise<void> {
    try {
      const authState = await getLocalAuthState();
      this.lastSyncAtInner = authState?.last_sync_at || null;
    } catch (error) {
      console.error('Failed to load last sync timestamp:', error);
    }
  }

  private canSync(): boolean {
    return this.isOnlineInner && isSupabaseConfigured();
  }

  private notifyStatusListeners(status: SyncStatusState, error?: string): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, error);
      } catch (e) {
        console.error('Error in sync status listener:', e);
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Don't retry auth errors
      if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
        return false;
      }

      // Don't retry validation errors
      if (message.includes('400') || message.includes('validation')) {
        return false;
      }

      // Don't retry not found errors
      if (message.includes('404')) {
        return false;
      }
    }

    // Retry network errors, timeouts, 5xx errors
    return true;
  }

  /**
   * Setup Supabase auth session for API calls.
   * Call this before making Supabase requests.
   */
  async setupAuthSession(): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const session = await getFullSession();
    if (!session) return false;

    await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    return true;
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}
