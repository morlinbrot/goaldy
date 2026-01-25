/**
 * CategoriesRepository
 *
 * Repository for managing categories with offline-first sync.
 * Only custom (user-created) categories are synced.
 */

import { getCurrentUserId } from '@/lib/auth';
import type { Category } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class CategoriesRepository extends BaseRepository<Category> {
  readonly tableName: SyncTableName = SYNC_TABLES.CATEGORIES;

  protected readonly columns = [
    'id',
    'user_id',
    'name',
    'icon',
    'color',
    'is_custom',
    'is_hidden',
    'sort_order',
    'created_at',
    'updated_at',
    'deleted_at',
  ];

  constructor(syncService: SyncService) {
    super(syncService);
    this.initializeDataSources();
  }

  // ============ Entity-Specific Queries ============

  /**
   * Get all visible categories (including default ones).
   */
  async getVisible(): Promise<Category[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM categories
       WHERE is_hidden = 0 AND deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`
    );
  }

  /**
   * Get only custom (user-created) categories.
   */
  async getCustom(): Promise<Category[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM categories
       WHERE is_custom = 1 AND deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`
    );
  }

  /**
   * Get only default (system) categories.
   */
  async getDefault(): Promise<Category[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM categories
       WHERE is_custom = 0 AND deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`
    );
  }

  /**
   * Get category by name.
   */
  async getByName(name: string): Promise<Category | null> {
    const results = await this.localDataSource.customQuery(
      `SELECT * FROM categories
       WHERE name = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [name]
    );
    return results[0] || null;
  }

  /**
   * Hide a category.
   */
  async hide(id: string): Promise<boolean> {
    const result = await this.update(id, { is_hidden: 1 });
    return result !== null;
  }

  /**
   * Show a hidden category.
   */
  async show(id: string): Promise<boolean> {
    const result = await this.update(id, { is_hidden: 0 });
    return result !== null;
  }

  /**
   * Update sort order for multiple categories.
   */
  async updateSortOrder(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.update(orderedIds[i], { sort_order: i + 1 });
    }
  }

  // ============ Override Base Methods ============

  /**
   * Override getAll to include default categories (which have null user_id).
   */
  async getAll(): Promise<Category[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM categories
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`
    );
  }

  /**
   * Override create to mark as custom category.
   */
  async create(data: Omit<Category, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'user_id' | 'is_custom'>): Promise<Category> {
    // Get max sort order
    const maxOrderResult = await this.localDataSource.customQuery<{ max_order: number | null }>(
      `SELECT MAX(sort_order) as max_order FROM categories`
    );
    const nextOrder = (maxOrderResult[0]?.max_order || 0) + 1;

    return super.create({
      ...data,
      is_custom: 1,
      sort_order: data.sort_order ?? nextOrder,
    } as Omit<Category, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'user_id'>);
  }

  // ============ Override Sync Methods ============

  /**
   * Override push to only sync custom categories.
   */
  async push(recordId: string, operation: string, payload: object): Promise<void> {
    const item = payload as Category;

    // Only sync custom categories
    if (!item.is_custom) {
      return;
    }

    await super.push(recordId, operation, payload);
  }

  /**
   * Override pull to only accept custom categories.
   */
  async pull(since: string | null): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    // Only pull user's custom categories
    const remoteItems = await this.remoteDataSource.getChangedSince(userId, since);
    let mergedCount = 0;

    for (const remoteItem of remoteItems) {
      // Only merge custom categories
      if (remoteItem.is_custom) {
        const merged = await this.merge(remoteItem);
        if (merged) mergedCount++;
      }
    }

    if (mergedCount > 0) {
      await this.notifyListeners();
    }

    return mergedCount;
  }
}
