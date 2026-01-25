/**
 * BaseRepository
 *
 * Abstract base class for entity repositories implementing the offline-first pattern:
 * - All reads come from LocalDataSource (source of truth)
 * - Writes go to LocalDataSource first, then queue for sync
 * - Implements observable pattern for React integration
 * - Default last-write-wins merge strategy
 */

import { getCurrentUserId } from '@/lib/auth';
import { generateId } from '@/lib/types';
import { LocalDataSource } from '../datasources/LocalDataSource';
import { RemoteDataSource } from '../datasources/RemoteDataSource';
import { SyncQueue } from '../services/SyncQueue';
import type { SyncableRepository, SyncService } from '../services/SyncService';
import type {
    DataListener,
    MergeStrategy,
    SyncableEntity,
    SyncOperation,
    SyncTableName,
} from '../types';

export abstract class BaseRepository<T extends SyncableEntity> implements SyncableRepository {
  protected localDataSource: LocalDataSource<T>;
  protected remoteDataSource: RemoteDataSource<T>;
  protected syncQueue: SyncQueue;
  protected syncService: SyncService;

  protected listeners: Set<DataListener<T>> = new Set();
  protected mergeStrategy: MergeStrategy = 'last-write-wins';

  // Abstract properties - must be implemented by subclasses
  abstract readonly tableName: SyncTableName;
  protected abstract readonly columns: string[];

  constructor(syncService: SyncService) {
    this.syncService = syncService;
    this.syncQueue = syncService.getSyncQueue();

    // Initialize data sources (will be properly set after tableName is available)
    // TypeScript doesn't know tableName is set in subclass constructor
    this.localDataSource = null as unknown as LocalDataSource<T>;
    this.remoteDataSource = null as unknown as RemoteDataSource<T>;
  }

  /**
   * Initialize data sources. Must be called by subclass constructor after setting tableName.
   */
  protected initializeDataSources(): void {
    this.localDataSource = new LocalDataSource<T>(this.tableName, this.columns);
    this.remoteDataSource = new RemoteDataSource<T>(this.tableName, this.columns);
  }

  // ============ Observable Pattern (React Integration) ============

  /**
   * Subscribe to data changes.
   * Immediately emits current data, then emits on each change.
   */
  subscribe(listener: DataListener<T>): () => void {
    this.listeners.add(listener);

    // Immediately emit current data
    this.emitCurrentData(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of data change.
   */
  protected async notifyListeners(): Promise<void> {
    if (this.listeners.size === 0) return;

    const data = await this.getAll();
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in data listener:', error);
      }
    }
  }

  /**
   * Emit current data to a specific listener.
   */
  private async emitCurrentData(listener: DataListener<T>): Promise<void> {
    try {
      const data = await this.getAll();
      listener(data);
    } catch (error) {
      console.error('Error emitting current data:', error);
      listener([]);
    }
  }

  // ============ Read Operations (Always from Local) ============

  /**
   * Get all items (excluding soft-deleted).
   */
  async getAll(): Promise<T[]> {
    return this.localDataSource.getAll(false);
  }

  /**
   * Get a single item by ID.
   */
  async getById(id: string): Promise<T | null> {
    return this.localDataSource.getById(id);
  }

  /**
   * Query items by filter.
   */
  async query(filter: Partial<T>): Promise<T[]> {
    return this.localDataSource.query(filter);
  }

  // ============ Write Operations (Local + Queue) ============

  /**
   * Create a new item.
   */
  async create(data: Omit<T, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'user_id'>): Promise<T> {
    const userId = await getCurrentUserId();
    const now = new Date().toISOString();

    const item = {
      ...data,
      id: generateId(),
      user_id: userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    } as T;

    // Write to local
    await this.localDataSource.insert(item);

    // Queue for sync if authenticated
    if (userId) {
      await this.syncQueue.enqueue(
        this.tableName,
        item.id,
        'insert',
        item,
        userId
      );
      this.syncService.schedulePush();
    }

    // Notify listeners
    await this.notifyListeners();

    return item;
  }

  /**
   * Update an existing item.
   */
  async update(id: string, changes: Partial<Omit<T, 'id' | 'created_at' | 'user_id'>>): Promise<T | null> {
    const existing = await this.localDataSource.getById(id);
    if (!existing) return null;

    const userId = await getCurrentUserId();
    const now = new Date().toISOString();

    const updatedChanges = {
      ...changes,
      updated_at: now,
    };

    // Update local
    await this.localDataSource.update(id, updatedChanges as Partial<T>);

    // Get the updated item
    const updated = await this.localDataSource.getById(id);
    if (!updated) return null;

    // Queue for sync if authenticated
    if (userId) {
      await this.syncQueue.enqueue(
        this.tableName,
        id,
        'update',
        updated,
        userId
      );
      this.syncService.schedulePush();
    }

    // Notify listeners
    await this.notifyListeners();

    return updated;
  }

  /**
   * Delete an item.
   * Soft delete if authenticated (for sync), hard delete otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.localDataSource.getById(id);
    if (!existing) return false;

    const userId = await getCurrentUserId();
    const now = new Date().toISOString();

    if (userId) {
      // Soft delete for authenticated users
      await this.localDataSource.delete(id, true);

      // Queue for sync
      await this.syncQueue.enqueue(
        this.tableName,
        id,
        'delete',
        { ...existing, deleted_at: now, updated_at: now },
        userId
      );
      this.syncService.schedulePush();
    } else {
      // Hard delete for unauthenticated users
      await this.localDataSource.delete(id, false);
    }

    // Notify listeners
    await this.notifyListeners();

    return true;
  }

  // ============ Sync Operations (Called by SyncService) ============

  /**
   * Pull changes from remote and merge into local.
   * Returns the number of items merged.
   */
  async pull(since: string | null): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    const remoteItems = await this.remoteDataSource.getChangedSince(userId, since);
    let mergedCount = 0;

    for (const remoteItem of remoteItems) {
      const merged = await this.merge(remoteItem);
      if (merged) mergedCount++;
    }

    // Notify listeners if anything changed
    if (mergedCount > 0) {
      await this.notifyListeners();
    }

    return mergedCount;
  }

  /**
   * Push a single queued item to remote.
   */
  async push(recordId: string, operation: string, payload: object): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const op = operation as SyncOperation;
    const item = payload as T;

    switch (op) {
      case 'insert':
      case 'update':
        await this.remoteDataSource.upsert(item, userId);
        break;

      case 'delete':
        const deletedAt = item.deleted_at || new Date().toISOString();
        await this.remoteDataSource.delete(recordId, userId, deletedAt);
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // ============ Merge Logic ============

  /**
   * Determine if remote version should overwrite local.
   */
  protected shouldAcceptRemote(remote: T, local: T | null): boolean {
    if (!local) return true;

    switch (this.mergeStrategy) {
      case 'last-write-wins':
        return new Date(remote.updated_at) > new Date(local.updated_at);
      case 'remote-wins':
        return true;
      case 'local-wins':
        return false;
      default:
        return new Date(remote.updated_at) > new Date(local.updated_at);
    }
  }

  /**
   * Merge a remote item into local storage.
   * Returns true if the item was merged (remote was accepted).
   *
   * Override in subclasses for entity-specific merge logic.
   */
  protected async merge(remote: T): Promise<boolean> {
    const local = await this.localDataSource.getById(remote.id);

    if (this.shouldAcceptRemote(remote, local)) {
      await this.localDataSource.upsert(remote);
      return true;
    }

    return false;
  }

  // ============ Utility Methods ============

  /**
   * Get count of items.
   */
  async count(filter?: Partial<T>): Promise<number> {
    return this.localDataSource.count(filter);
  }

  /**
   * Check if an item exists.
   */
  async exists(id: string): Promise<boolean> {
    return this.localDataSource.exists(id);
  }

  /**
   * Force refresh from remote (pull all).
   */
  async forceRefresh(): Promise<number> {
    return this.pull(null);
  }
}
