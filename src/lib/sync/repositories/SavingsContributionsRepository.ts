/**
 * SavingsContributionsRepository
 *
 * Repository for managing savings contributions with offline-first sync.
 */

import type { SavingsContribution } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class SavingsContributionsRepository extends BaseRepository<SavingsContribution> {
  readonly tableName: SyncTableName = SYNC_TABLES.SAVINGS_CONTRIBUTIONS;

  protected readonly columns = [
    'id',
    'user_id',
    'goal_id',
    'month',
    'amount',
    'is_full_amount',
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
   * Get contributions for a specific goal.
   */
  async getByGoal(goalId: string): Promise<SavingsContribution[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM savings_contributions
       WHERE goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC`,
      [goalId]
    );
  }

  /**
   * Get contributions for a specific month.
   */
  async getByMonth(month: string): Promise<SavingsContribution[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM savings_contributions
       WHERE month = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [month]
    );
  }

  /**
   * Get contribution for a specific goal and month.
   */
  async getByGoalAndMonth(goalId: string, month: string): Promise<SavingsContribution | null> {
    const results = await this.localDataSource.customQuery(
      `SELECT * FROM savings_contributions
       WHERE goal_id = $1 AND month = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [goalId, month]
    );
    return results[0] || null;
  }

  /**
   * Get total contributions for a goal.
   */
  async getTotalForGoal(goalId: string): Promise<number> {
    const result = await this.localDataSource.customQuery<{ total: number | null }>(
      `SELECT SUM(amount) as total FROM savings_contributions
       WHERE goal_id = $1 AND deleted_at IS NULL`,
      [goalId]
    );
    return result[0]?.total || 0;
  }

  /**
   * Get total contributions for a month across all goals.
   */
  async getTotalForMonth(month: string): Promise<number> {
    const result = await this.localDataSource.customQuery<{ total: number | null }>(
      `SELECT SUM(amount) as total FROM savings_contributions
       WHERE month = $1 AND deleted_at IS NULL`,
      [month]
    );
    return result[0]?.total || 0;
  }

  /**
   * Create or update contribution for a goal and month.
   */
  async upsertForGoalMonth(
    goalId: string,
    month: string,
    data: { amount: number; is_full_amount?: number | null }
  ): Promise<SavingsContribution> {
    const existing = await this.getByGoalAndMonth(goalId, month);

    if (existing) {
      const updated = await this.update(existing.id, {
        amount: data.amount,
        is_full_amount: data.is_full_amount ?? existing.is_full_amount,
      });
      return updated!;
    }

    return this.create({
      goal_id: goalId,
      month,
      amount: data.amount,
      is_full_amount: data.is_full_amount ?? null,
    });
  }

  /**
   * Get contribution history for a goal (last N months).
   */
  async getHistoryForGoal(goalId: string, months: number = 12): Promise<SavingsContribution[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM savings_contributions
       WHERE goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC
       LIMIT $2`,
      [goalId, months]
    );
  }
}
