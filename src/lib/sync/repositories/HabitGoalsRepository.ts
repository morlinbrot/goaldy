/**
 * HabitGoalsRepository
 *
 * Repository for managing habit goals (spending reduction targets) with offline-first sync.
 */

import type { HabitGoal, HabitGoalWithStats } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class HabitGoalsRepository extends BaseRepository<HabitGoal> {
  readonly tableName: SyncTableName = SYNC_TABLES.HABIT_GOALS;

  protected readonly columns = [
    'id',
    'user_id',
    'name',
    'category_id',
    'rule_type',
    'rule_value',
    'duration_months',
    'start_date',
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
   * Get all active habit goals (not expired).
   */
  async getActive(): Promise<HabitGoal[]> {
    const now = new Date();
    return this.localDataSource.customQuery(
      `SELECT * FROM habit_goals
       WHERE deleted_at IS NULL
       AND (
         duration_months IS NULL
         OR date(start_date, '+' || duration_months || ' months') >= date($1)
       )
       ORDER BY start_date DESC`,
      [now.toISOString().split('T')[0]]
    );
  }

  /**
   * Get habit goals for a specific category.
   */
  async getByCategory(categoryId: string): Promise<HabitGoal[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM habit_goals
       WHERE category_id = $1 AND deleted_at IS NULL
       ORDER BY start_date DESC`,
      [categoryId]
    );
  }

  /**
   * Get habit goals by rule type.
   */
  async getByRuleType(ruleType: 'max_amount' | 'max_percentage' | 'reduce_by'): Promise<HabitGoal[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM habit_goals
       WHERE rule_type = $1 AND deleted_at IS NULL
       ORDER BY start_date DESC`,
      [ruleType]
    );
  }

  /**
   * Get habit goal with category details and current month stats.
   */
  async getWithStats(id: string, currentMonth: string): Promise<HabitGoalWithStats | null> {
    type GoalWithCategory = HabitGoal & {
      category_name: string | null;
      category_icon: string | null;
      category_color: string | null;
    };

    const results = await this.localDataSource.customQuery<GoalWithCategory>(
      `SELECT hg.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM habit_goals hg
       LEFT JOIN categories c ON hg.category_id = c.id
       WHERE hg.id = $1 AND hg.deleted_at IS NULL`,
      [id]
    );

    const goal = results[0];
    if (!goal) return null;

    // Get current month tracking
    type TrackingResult = {
      spent_amount: number;
      target_amount: number;
      is_compliant: number | null;
    };

    const trackingResult = await this.localDataSource.customQuery<TrackingResult>(
      `SELECT spent_amount, target_amount, is_compliant FROM habit_tracking
       WHERE habit_goal_id = $1 AND month = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [id, currentMonth]
    );

    const tracking = trackingResult[0];
    const currentMonthSpent = tracking?.spent_amount || 0;
    const currentMonthTarget = tracking?.target_amount || goal.rule_value;
    const percentageUsed = currentMonthTarget > 0
      ? (currentMonthSpent / currentMonthTarget) * 100
      : 0;

    // Calculate streak
    const streakResult = await this.localDataSource.customQuery<{ month: string; is_compliant: number }>(
      `SELECT month, is_compliant FROM habit_tracking
       WHERE habit_goal_id = $1 AND deleted_at IS NULL
       ORDER BY month DESC`,
      [id]
    );

    let currentStreak = 0;
    for (const record of streakResult) {
      if (record.is_compliant === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Determine status
    let status: 'safe' | 'warning' | 'exceeded';
    if (percentageUsed >= 100) {
      status = 'exceeded';
    } else if (percentageUsed >= 80) {
      status = 'warning';
    } else {
      status = 'safe';
    }

    return {
      ...goal,
      category_name: goal.category_name,
      category_icon: goal.category_icon,
      category_color: goal.category_color,
      current_month_spent: currentMonthSpent,
      current_month_target: currentMonthTarget,
      percentage_used: Math.min(100, percentageUsed),
      is_compliant: percentageUsed <= 100,
      current_streak: currentStreak,
      status,
    };
  }

  /**
   * Get all habit goals with their statistics.
   */
  async getAllWithStats(currentMonth: string): Promise<HabitGoalWithStats[]> {
    const goals = await this.getAll();
    const goalsWithStats: HabitGoalWithStats[] = [];

    for (const goal of goals) {
      const withStats = await this.getWithStats(goal.id, currentMonth);
      if (withStats) {
        goalsWithStats.push(withStats);
      }
    }

    return goalsWithStats;
  }

  /**
   * Check if a category already has an active habit goal.
   */
  async hasActiveGoalForCategory(categoryId: string): Promise<boolean> {
    const now = new Date();
    const results = await this.localDataSource.customQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM habit_goals
       WHERE category_id = $1 AND deleted_at IS NULL
       AND (
         duration_months IS NULL
         OR date(start_date, '+' || duration_months || ' months') >= date($2)
       )`,
      [categoryId, now.toISOString().split('T')[0]]
    );
    return (results[0]?.count || 0) > 0;
  }

  /**
   * Get habit goals that need an alert (approaching or exceeding limits).
   * Returns habits where spending is >= 80% of target (warning) or >= 100% (exceeded).
   */
  async getGoalsNeedingAlert(currentMonth: string): Promise<HabitGoalWithStats[]> {
    const allGoals = await this.getAllWithStats(currentMonth);
    return allGoals.filter(goal => goal.status === 'warning' || goal.status === 'exceeded');
  }
}
