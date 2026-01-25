/**
 * SavingsGoalsRepository
 *
 * Repository for managing savings goals with offline-first sync.
 */

import type { SavingsGoal, SavingsGoalWithStats } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class SavingsGoalsRepository extends BaseRepository<SavingsGoal> {
  readonly tableName: SyncTableName = SYNC_TABLES.SAVINGS_GOALS;

  protected readonly columns = [
    'id',
    'user_id',
    'name',
    'target_amount',
    'target_date',
    'monthly_contribution',
    'why_statement',
    'privacy_level',
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
   * Get all active (non-completed) savings goals.
   */
  async getActive(): Promise<SavingsGoal[]> {
    const now = new Date().toISOString().split('T')[0];
    return this.localDataSource.customQuery(
      `SELECT * FROM savings_goals
       WHERE target_date >= $1 AND deleted_at IS NULL
       ORDER BY target_date ASC`,
      [now]
    );
  }

  /**
   * Get savings goals by privacy level.
   */
  async getByPrivacyLevel(level: 'private' | 'progress_only' | 'full'): Promise<SavingsGoal[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM savings_goals
       WHERE privacy_level = $1 AND deleted_at IS NULL
       ORDER BY target_date ASC`,
      [level]
    );
  }

  /**
   * Get savings goal with calculated statistics.
   */
  async getWithStats(id: string): Promise<SavingsGoalWithStats | null> {
    const goal = await this.getById(id);
    if (!goal) return null;

    // Get total contributions
    const contributionsResult = await this.localDataSource.customQuery<{ total: number | null }>(
      `SELECT SUM(amount) as total FROM savings_contributions
       WHERE goal_id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const totalSaved = contributionsResult[0]?.total || 0;

    // Get contribution count for streak calculation
    const streakResult = await this.localDataSource.customQuery<{ month: string }>(
      `SELECT month FROM savings_contributions
       WHERE goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC`,
      [id]
    );

    // Calculate stats
    const percentageComplete = (totalSaved / goal.target_amount) * 100;
    const targetDate = new Date(goal.target_date);
    const now = new Date();
    const monthsRemaining = Math.max(0,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth())
    );

    // Simple streak calculation (consecutive months)
    let currentStreak = 0;
    const months = streakResult.map(r => r.month);

    for (let i = 0; i < months.length; i++) {
      const expectedMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const expected = `${expectedMonth.getFullYear()}-${String(expectedMonth.getMonth() + 1).padStart(2, '0')}`;
      if (months.includes(expected)) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Is on track calculation
    const expectedSavedByNow = goal.monthly_contribution *
      ((now.getFullYear() - new Date(goal.created_at).getFullYear()) * 12 +
       (now.getMonth() - new Date(goal.created_at).getMonth()));
    const isOnTrack = totalSaved >= expectedSavedByNow * 0.9; // 90% tolerance

    // Projected completion date
    let projectedCompletionDate: string | null = null;
    if (totalSaved < goal.target_amount && goal.monthly_contribution > 0) {
      const remaining = goal.target_amount - totalSaved;
      const monthsToComplete = Math.ceil(remaining / goal.monthly_contribution);
      const projected = new Date(now.getFullYear(), now.getMonth() + monthsToComplete, 1);
      projectedCompletionDate = projected.toISOString().split('T')[0];
    }

    return {
      ...goal,
      total_saved: totalSaved,
      percentage_complete: Math.min(100, percentageComplete),
      months_remaining: monthsRemaining,
      is_on_track: isOnTrack,
      projected_completion_date: projectedCompletionDate,
      current_streak: currentStreak,
    };
  }

  /**
   * Get all goals with their statistics.
   */
  async getAllWithStats(): Promise<SavingsGoalWithStats[]> {
    const goals = await this.getAll();
    const goalsWithStats: SavingsGoalWithStats[] = [];

    for (const goal of goals) {
      const withStats = await this.getWithStats(goal.id);
      if (withStats) {
        goalsWithStats.push(withStats);
      }
    }

    return goalsWithStats;
  }
}
