/**
 * BudgetsRepository
 *
 * Repository for managing budgets with offline-first sync.
 * Has custom merge logic to handle UNIQUE constraint on month.
 */

import { getCurrentMonth, type Budget } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class BudgetsRepository extends BaseRepository<Budget> {
  readonly tableName: SyncTableName = SYNC_TABLES.BUDGETS;

  protected readonly columns = [
    'id',
    'user_id',
    'month',
    'total_amount',
    'spending_limit',
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
   * Get budget for a specific month.
   */
  async getByMonth(month: string): Promise<Budget | null> {
    const results = await this.localDataSource.customQuery(
      `SELECT * FROM budgets WHERE month = $1 AND deleted_at IS NULL LIMIT 1`,
      [month]
    );
    return results[0] || null;
  }

  /**
   * Get the current month's budget.
   */
  async getCurrentBudget(): Promise<Budget | null> {
    return this.getByMonth(getCurrentMonth());
  }

  /**
   * Get budgets for the last N months.
   */
  async getRecentBudgets(months: number = 6): Promise<Budget[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM budgets
       WHERE deleted_at IS NULL
       ORDER BY month DESC
       LIMIT $1`,
      [months]
    );
  }

  /**
   * Create or update budget for a month.
   * If a budget exists for the month, update it; otherwise create new.
   */
  async upsertForMonth(
    month: string,
    data: { total_amount: number; spending_limit?: number | null }
  ): Promise<Budget> {
    const existing = await this.getByMonth(month);

    if (existing) {
      const updated = await this.update(existing.id, {
        total_amount: data.total_amount,
        spending_limit: data.spending_limit ?? existing.spending_limit,
      });
      return updated!;
    }

    return this.create({
      month,
      total_amount: data.total_amount,
      spending_limit: data.spending_limit ?? null,
    });
  }

  // ============ Custom Merge Logic ============

  /**
   * Override merge to handle UNIQUE constraint on month.
   * If remote budget has same month but different ID, we need to handle the conflict.
   */
  protected async merge(remote: Budget): Promise<boolean> {
    // First check by ID
    const localById = await this.localDataSource.getById(remote.id);

    if (localById) {
      // Same ID exists locally - use standard last-write-wins
      if (this.shouldAcceptRemote(remote, localById)) {
        await this.localDataSource.upsert(remote);
        return true;
      }
      return false;
    }

    // No local record with same ID - check for month conflict
    const localByMonth = await this.getByMonth(remote.month);

    if (localByMonth) {
      // Different ID but same month - we have a conflict
      // Use last-write-wins to decide which to keep
      if (this.shouldAcceptRemote(remote, localByMonth)) {
        // Remote wins - delete local and insert remote
        await this.localDataSource.delete(localByMonth.id, false);
        await this.localDataSource.insert(remote);
        return true;
      }
      // Local wins - don't accept remote
      return false;
    }

    // No conflict - insert new
    await this.localDataSource.insert(remote);
    return true;
  }
}
