/**
 * HabitTrackingRepository
 *
 * Repository for managing habit tracking records with offline-first sync.
 */

import type { HabitTracking } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class HabitTrackingRepository extends BaseRepository<HabitTracking> {
  readonly tableName: SyncTableName = SYNC_TABLES.HABIT_TRACKING;

  protected readonly columns = [
    'id',
    'user_id',
    'habit_goal_id',
    'month',
    'spent_amount',
    'target_amount',
    'is_compliant',
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
   * Get tracking records for a specific habit goal.
   */
  async getByHabitGoal(habitGoalId: string): Promise<HabitTracking[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM habit_tracking
       WHERE habit_goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC`,
      [habitGoalId]
    );
  }

  /**
   * Get tracking records for a specific month.
   */
  async getByMonth(month: string): Promise<HabitTracking[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM habit_tracking
       WHERE month = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [month]
    );
  }

  /**
   * Get tracking record for a specific habit goal and month.
   */
  async getByHabitGoalAndMonth(habitGoalId: string, month: string): Promise<HabitTracking | null> {
    const results = await this.localDataSource.customQuery(
      `SELECT * FROM habit_tracking
       WHERE habit_goal_id = $1 AND month = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [habitGoalId, month]
    );
    return results[0] || null;
  }

  /**
   * Update or create tracking record for a habit goal and month.
   */
  async upsertForHabitMonth(
    habitGoalId: string,
    month: string,
    data: {
      spent_amount: number;
      target_amount: number;
      is_compliant?: number | null;
    }
  ): Promise<HabitTracking> {
    const existing = await this.getByHabitGoalAndMonth(habitGoalId, month);

    const isCompliant = data.is_compliant ?? (data.spent_amount <= data.target_amount ? 1 : 0);

    if (existing) {
      const updated = await this.update(existing.id, {
        spent_amount: data.spent_amount,
        target_amount: data.target_amount,
        is_compliant: isCompliant,
      });
      return updated!;
    }

    return this.create({
      habit_goal_id: habitGoalId,
      month,
      spent_amount: data.spent_amount,
      target_amount: data.target_amount,
      is_compliant: isCompliant,
    });
  }

  /**
   * Get compliance history for a habit goal.
   */
  async getComplianceHistory(habitGoalId: string, months: number = 12): Promise<{
    month: string;
    is_compliant: boolean;
    spent_amount: number;
    target_amount: number;
  }[]> {
    const records = await this.localDataSource.customQuery<HabitTracking>(
      `SELECT * FROM habit_tracking
       WHERE habit_goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC
       LIMIT $2`,
      [habitGoalId, months]
    );

    return records.map(r => ({
      month: r.month,
      is_compliant: r.is_compliant === 1,
      spent_amount: r.spent_amount,
      target_amount: r.target_amount,
    }));
  }

  /**
   * Calculate current streak for a habit goal.
   */
  async getCurrentStreak(habitGoalId: string): Promise<number> {
    const records = await this.localDataSource.customQuery<{ is_compliant: number }>(
      `SELECT is_compliant FROM habit_tracking
       WHERE habit_goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC`,
      [habitGoalId]
    );

    let streak = 0;
    for (const record of records) {
      if (record.is_compliant === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Get all compliant months for a habit goal.
   */
  async getCompliantMonths(habitGoalId: string): Promise<string[]> {
    const records = await this.localDataSource.customQuery<{ month: string }>(
      `SELECT month FROM habit_tracking
       WHERE habit_goal_id = $1 AND is_compliant = 1 AND deleted_at IS NULL
       ORDER BY month DESC`,
      [habitGoalId]
    );

    return records.map(r => r.month);
  }
}
