/**
 * ExpensesRepository
 *
 * Repository for managing expenses with offline-first sync.
 */

import type { Expense, ExpenseWithCategory } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class ExpensesRepository extends BaseRepository<Expense> {
  readonly tableName: SyncTableName = SYNC_TABLES.EXPENSES;

  protected readonly columns = [
    'id',
    'user_id',
    'amount',
    'category_id',
    'note',
    'date',
    'created_at',
    'updated_at',
    'synced_at',
    'deleted_at',
  ];

  constructor(syncService: SyncService) {
    super(syncService);
    this.initializeDataSources();
  }

  // ============ Entity-Specific Queries ============

  /**
   * Get expenses for a specific date range.
   */
  async getByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM expenses
       WHERE date >= $1 AND date <= $2 AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC`,
      [startDate, endDate]
    );
  }

  /**
   * Get expenses for a specific month (YYYY-MM format).
   */
  async getByMonth(month: string): Promise<Expense[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM expenses
       WHERE date LIKE $1 AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC`,
      [`${month}%`]
    );
  }

  /**
   * Get expenses for a specific category.
   */
  async getByCategory(categoryId: string): Promise<Expense[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM expenses
       WHERE category_id = $1 AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC`,
      [categoryId]
    );
  }

  /**
   * Get expenses with category details.
   */
  async getAllWithCategories(): Promise<ExpenseWithCategory[]> {
    return this.localDataSource.customQuery(
      `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.deleted_at IS NULL
       ORDER BY e.date DESC, e.created_at DESC`
    ) as Promise<ExpenseWithCategory[]>;
  }

  /**
   * Get expenses for a month with category details.
   */
  async getByMonthWithCategories(month: string): Promise<ExpenseWithCategory[]> {
    return this.localDataSource.customQuery(
      `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.date LIKE $1 AND e.deleted_at IS NULL
       ORDER BY e.date DESC, e.created_at DESC`,
      [`${month}%`]
    ) as Promise<ExpenseWithCategory[]>;
  }

  /**
   * Get total spending for a month.
   */
  async getTotalForMonth(month: string): Promise<number> {
    const result = await this.localDataSource.customQuery<{ total: number | null }>(
      `SELECT SUM(amount) as total FROM expenses
       WHERE date LIKE $1 AND deleted_at IS NULL`,
      [`${month}%`]
    );
    return result[0]?.total || 0;
  }

  /**
   * Get spending by category for a month.
   */
  async getSpendingByCategory(month: string): Promise<{ category_id: string; total: number }[]> {
    return this.localDataSource.customQuery<{ category_id: string; total: number }>(
      `SELECT category_id, SUM(amount) as total
       FROM expenses
       WHERE date LIKE $1 AND deleted_at IS NULL
       GROUP BY category_id`,
      [`${month}%`]
    );
  }

  /**
   * Get recent expenses (last N items).
   */
  async getRecent(limit: number = 10): Promise<Expense[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM expenses
       WHERE deleted_at IS NULL
       ORDER BY date DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );
  }
}
