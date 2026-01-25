/**
 * DataSource Types
 *
 * Interfaces for local and remote data sources.
 * These abstractions allow repositories to work with different storage backends.
 */

import type { SyncableEntity } from '../types';

/**
 * Interface for local data source operations (SQLite).
 * All reads in the app come from here.
 */
export interface LocalDataSource<T extends SyncableEntity> {
  /**
   * Get a single item by ID.
   */
  getById(id: string): Promise<T | null>;

  /**
   * Get all items, optionally including soft-deleted ones.
   */
  getAll(includeDeleted?: boolean): Promise<T[]>;

  /**
   * Insert a new item.
   */
  insert(item: T): Promise<void>;

  /**
   * Update an existing item.
   */
  update(id: string, changes: Partial<T>): Promise<void>;

  /**
   * Delete an item. If soft=true, sets deleted_at instead of removing.
   */
  delete(id: string, soft: boolean): Promise<void>;

  /**
   * Insert or update an item based on ID.
   */
  upsert(item: T): Promise<void>;

  /**
   * Query items by filter criteria.
   */
  query(filter: Partial<T>): Promise<T[]>;
}

/**
 * Interface for remote data source operations (Supabase).
 * Used for syncing with the server.
 */
export interface RemoteDataSource<T extends SyncableEntity> {
  /**
   * Get a single item by ID from remote.
   */
  getById(id: string, userId: string): Promise<T | null>;

  /**
   * Get all items changed since a timestamp.
   * If since is null, returns all items.
   */
  getChangedSince(userId: string, since: string | null): Promise<T[]>;

  /**
   * Insert or update an item on remote.
   */
  upsert(item: T, userId: string): Promise<void>;

  /**
   * Soft delete an item on remote (set deleted_at).
   */
  delete(id: string, userId: string, deletedAt: string): Promise<void>;
}

/**
 * Column mapping for converting between local SQLite and remote Supabase schemas.
 * Some tables may have different column names or need transformations.
 */
export interface ColumnMapping {
  local: string;
  remote: string;
  transform?: {
    toRemote?: (value: unknown) => unknown;
    toLocal?: (value: unknown) => unknown;
  };
}

/**
 * Table configuration for data sources.
 */
export interface TableConfig {
  tableName: string;
  primaryKey: string;
  columns: string[];
  columnMappings?: ColumnMapping[];
}
