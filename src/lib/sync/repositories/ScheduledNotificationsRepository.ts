/**
 * ScheduledNotificationsRepository
 *
 * Repository for managing scheduled notifications with offline-first sync.
 */

import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName, type SyncableEntity } from '../types';
import { BaseRepository } from './BaseRepository';

// Scheduled notification entity type
export interface ScheduledNotification extends SyncableEntity {
  notification_type: string;
  goal_id: string | null;
  title: string;
  body: string;
  scheduled_at: string;
  cron_expression: string | null;
  sent_at: string | null;
}

export class ScheduledNotificationsRepository extends BaseRepository<ScheduledNotification> {
  readonly tableName: SyncTableName = SYNC_TABLES.SCHEDULED_NOTIFICATIONS;

  protected readonly columns = [
    'id',
    'user_id',
    'notification_type',
    'goal_id',
    'title',
    'body',
    'scheduled_at',
    'cron_expression',
    'sent_at',
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
   * Get pending notifications (not yet sent).
   */
  async getPending(): Promise<ScheduledNotification[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM scheduled_notifications
       WHERE sent_at IS NULL AND deleted_at IS NULL
       ORDER BY scheduled_at ASC`
    );
  }

  /**
   * Get notifications due for sending.
   */
  async getDue(): Promise<ScheduledNotification[]> {
    const now = new Date().toISOString();
    return this.localDataSource.customQuery(
      `SELECT * FROM scheduled_notifications
       WHERE scheduled_at <= $1 AND sent_at IS NULL AND deleted_at IS NULL
       ORDER BY scheduled_at ASC`,
      [now]
    );
  }

  /**
   * Get notifications by type.
   */
  async getByType(notificationType: string): Promise<ScheduledNotification[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM scheduled_notifications
       WHERE notification_type = $1 AND deleted_at IS NULL
       ORDER BY scheduled_at ASC`,
      [notificationType]
    );
  }

  /**
   * Get notifications for a specific goal.
   */
  async getByGoal(goalId: string): Promise<ScheduledNotification[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM scheduled_notifications
       WHERE goal_id = $1 AND deleted_at IS NULL
       ORDER BY scheduled_at ASC`,
      [goalId]
    );
  }

  /**
   * Mark a notification as sent.
   */
  async markSent(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.update(id, { sent_at: now });
    return result !== null;
  }

  /**
   * Get recurring notifications (with cron expression).
   */
  async getRecurring(): Promise<ScheduledNotification[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM scheduled_notifications
       WHERE cron_expression IS NOT NULL AND deleted_at IS NULL
       ORDER BY notification_type, scheduled_at ASC`
    );
  }

  /**
   * Cancel all notifications for a goal.
   */
  async cancelForGoal(goalId: string): Promise<number> {
    const notifications = await this.getByGoal(goalId);
    let cancelled = 0;

    for (const notification of notifications) {
      if (await this.delete(notification.id)) {
        cancelled++;
      }
    }

    return cancelled;
  }

  /**
   * Get sent notifications history.
   */
  async getSentHistory(limit: number = 50): Promise<ScheduledNotification[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM scheduled_notifications
       WHERE sent_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY sent_at DESC
       LIMIT $1`,
      [limit]
    );
  }
}
