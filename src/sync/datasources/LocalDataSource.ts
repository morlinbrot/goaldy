/**
 * LocalDataSource
 *
 * Generic SQLite data source implementation.
 * Each entity repository creates an instance with the appropriate table configuration.
 */

import { getDatabase } from '@/lib/database';
import type { SyncableEntity } from '../types';
import type { LocalDataSource as ILocalDataSource } from './types';

export class LocalDataSource<T extends SyncableEntity> implements ILocalDataSource<T> {
  constructor(
    private readonly tableName: string,
    private readonly columns: string[]
  ) {}

  async getById(id: string): Promise<T | null> {
    const db = await getDatabase();
    const results = await db.select<T[]>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return results[0] || null;
  }

  async getAll(includeDeleted: boolean = false): Promise<T[]> {
    const db = await getDatabase();
    const whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    return db.select<T[]>(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC`
    );
  }

  async insert(item: T): Promise<void> {
    const db = await getDatabase();

    const filteredColumns = this.columns.filter(col => col in item);
    const placeholders = filteredColumns.map((_, i) => `$${i + 1}`).join(', ');
    const values = filteredColumns.map(col => (item as Record<string, unknown>)[col]);

    await db.execute(
      `INSERT INTO ${this.tableName} (${filteredColumns.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const db = await getDatabase();

    const entries = Object.entries(changes).filter(([key]) =>
      this.columns.includes(key) && key !== 'id'
    );

    if (entries.length === 0) return;

    const setClause = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const values = [...entries.map(([, value]) => value), id];

    await db.execute(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = $${values.length}`,
      values
    );
  }

  async delete(id: string, soft: boolean): Promise<void> {
    const db = await getDatabase();

    if (soft) {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE ${this.tableName} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
        [now, now, id]
      );
    } else {
      await db.execute(
        `DELETE FROM ${this.tableName} WHERE id = $1`,
        [id]
      );
    }
  }

  async upsert(item: T): Promise<void> {
    const existing = await this.getById(item.id);

    if (existing) {
      // Update: exclude id, created_at from the update
      const changes = { ...item } as Partial<T>;
      delete (changes as Record<string, unknown>).id;
      delete (changes as Record<string, unknown>).created_at;
      await this.update(item.id, changes);
    } else {
      await this.insert(item);
    }
  }

  async query(filter: Partial<T>): Promise<T[]> {
    const db = await getDatabase();

    const entries = Object.entries(filter).filter(([key]) =>
      this.columns.includes(key)
    );

    if (entries.length === 0) {
      return this.getAll();
    }

    const whereClause = entries
      .map(([key], i) => `${key} = $${i + 1}`)
      .join(' AND ');
    const values = entries.map(([, value]) => value);

    return db.select<T[]>(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause} AND deleted_at IS NULL ORDER BY created_at DESC`,
      values
    );
  }

  // ============ Additional Utility Methods ============

  /**
   * Get items by user ID.
   */
  async getByUserId(userId: string, includeDeleted: boolean = false): Promise<T[]> {
    const db = await getDatabase();
    const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';

    return db.select<T[]>(
      `SELECT * FROM ${this.tableName} WHERE user_id = $1 ${deletedClause} ORDER BY created_at DESC`,
      [userId]
    );
  }

  /**
   * Get items updated since a timestamp.
   */
  async getUpdatedSince(since: string): Promise<T[]> {
    const db = await getDatabase();
    return db.select<T[]>(
      `SELECT * FROM ${this.tableName} WHERE updated_at > $1 ORDER BY updated_at ASC`,
      [since]
    );
  }

  /**
   * Execute a custom query with optional custom return type.
   */
  async customQuery<R = T>(sql: string, params: unknown[] = []): Promise<R[]> {
    const db = await getDatabase();
    return db.select<R[]>(sql, params);
  }

  /**
   * Execute a custom command (INSERT, UPDATE, DELETE).
   */
  async customExecute(sql: string, params: unknown[] = []): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(sql, params);
    return result.rowsAffected;
  }

  /**
   * Count items matching a filter.
   */
  async count(filter?: Partial<T>): Promise<number> {
    const db = await getDatabase();

    if (!filter || Object.keys(filter).length === 0) {
      const result = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE deleted_at IS NULL`
      );
      return result[0]?.count || 0;
    }

    const entries = Object.entries(filter).filter(([key]) =>
      this.columns.includes(key)
    );

    const whereClause = entries
      .map(([key], i) => `${key} = $${i + 1}`)
      .join(' AND ');
    const values = entries.map(([, value]) => value);

    const result = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${whereClause} AND deleted_at IS NULL`,
      values
    );

    return result[0]?.count || 0;
  }

  /**
   * Check if an item exists.
   */
  async exists(id: string): Promise<boolean> {
    const item = await this.getById(id);
    return item !== null;
  }

  /**
   * Bulk insert items.
   */
  async insertMany(items: T[]): Promise<void> {
    for (const item of items) {
      await this.insert(item);
    }
  }

  /**
   * Bulk upsert items.
   */
  async upsertMany(items: T[]): Promise<void> {
    for (const item of items) {
      await this.upsert(item);
    }
  }
}
