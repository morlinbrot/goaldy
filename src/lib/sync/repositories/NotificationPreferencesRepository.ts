/**
 * NotificationPreferencesRepository
 *
 * Repository for managing notification preferences with offline-first sync.
 * Special handling: uses id=1 locally, user_id as PK on remote.
 */

import { getCurrentUserId } from '@/lib/auth';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName, type SyncableEntity } from '../types';
import { BaseRepository } from './BaseRepository';

// Notification preferences entity type
export interface NotificationPreferences extends SyncableEntity {
  id: string; // Always '1' locally, maps to user_id on remote
  notifications_enabled: number;
  monthly_checkin_enabled: number;
  monthly_checkin_cron: string;
  progress_updates_enabled: number;
  progress_updates_cron: string;
  why_reminders_enabled: number;
  why_reminders_cron: string;
  quiet_hours_enabled: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export class NotificationPreferencesRepository extends BaseRepository<NotificationPreferences> {
  readonly tableName: SyncTableName = SYNC_TABLES.NOTIFICATION_PREFERENCES;

  protected readonly columns = [
    'id',
    'user_id',
    'notifications_enabled',
    'monthly_checkin_enabled',
    'monthly_checkin_cron',
    'progress_updates_enabled',
    'progress_updates_cron',
    'why_reminders_enabled',
    'why_reminders_cron',
    'quiet_hours_enabled',
    'quiet_hours_start',
    'quiet_hours_end',
    'created_at',
    'updated_at',
  ];

  constructor(syncService: SyncService) {
    super(syncService);
    this.initializeDataSources();
  }

  // ============ Entity-Specific Methods ============

  /**
   * Get current notification preferences.
   * There's only one row with id=1.
   */
  async getPreferences(): Promise<NotificationPreferences | null> {
    const results = await this.localDataSource.customQuery(
      `SELECT * FROM notification_preferences WHERE id = 1 LIMIT 1`
    );
    return results[0] || null;
  }

  /**
   * Get or create notification preferences with defaults.
   */
  async getOrCreatePreferences(): Promise<NotificationPreferences> {
    const existing = await this.getPreferences();
    if (existing) return existing;

    const userId = await getCurrentUserId();
    const now = new Date().toISOString();

    const defaults: NotificationPreferences = {
      id: '1',
      user_id: userId,
      notifications_enabled: 1,
      monthly_checkin_enabled: 1,
      monthly_checkin_cron: '0 9 2 * *',
      progress_updates_enabled: 1,
      progress_updates_cron: '0 10 * * 1',
      why_reminders_enabled: 1,
      why_reminders_cron: '0 19 * * 1',
      quiet_hours_enabled: 0,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    await this.localDataSource.customExecute(
      `INSERT INTO notification_preferences (
        id, user_id, notifications_enabled,
        monthly_checkin_enabled, monthly_checkin_cron,
        progress_updates_enabled, progress_updates_cron,
        why_reminders_enabled, why_reminders_cron,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
        created_at, updated_at
      ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId,
        defaults.notifications_enabled,
        defaults.monthly_checkin_enabled,
        defaults.monthly_checkin_cron,
        defaults.progress_updates_enabled,
        defaults.progress_updates_cron,
        defaults.why_reminders_enabled,
        defaults.why_reminders_cron,
        defaults.quiet_hours_enabled,
        defaults.quiet_hours_start,
        defaults.quiet_hours_end,
        now,
        now,
      ]
    );

    return defaults;
  }

  /**
   * Update notification preferences.
   */
  async updatePreferences(changes: Partial<Omit<NotificationPreferences, 'id' | 'created_at' | 'user_id'>>): Promise<NotificationPreferences> {
    await this.getOrCreatePreferences(); // Ensure exists

    const updated = await this.update('1', changes);
    return updated || await this.getPreferences() as NotificationPreferences;
  }

  // ============ Override Sync Methods ============

  /**
   * Override push - notification_preferences uses user_id as PK on remote.
   */
  async push(_recordId: string, _operation: string, payload: object): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    // For notification_preferences, we always upsert on user_id
    const item = payload as NotificationPreferences;

    const supabase = (await import('@/lib/supabase')).getSupabase();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const session = await (await import('@/lib/auth')).getFullSession();
    if (!session) {
      throw new Error('No auth session');
    }

    await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        notifications_enabled: item.notifications_enabled,
        monthly_checkin_enabled: item.monthly_checkin_enabled,
        monthly_checkin_cron: item.monthly_checkin_cron,
        progress_updates_enabled: item.progress_updates_enabled,
        progress_updates_cron: item.progress_updates_cron,
        why_reminders_enabled: item.why_reminders_enabled,
        why_reminders_cron: item.why_reminders_cron,
        quiet_hours_enabled: item.quiet_hours_enabled,
        quiet_hours_start: item.quiet_hours_start,
        quiet_hours_end: item.quiet_hours_end,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updated_at: item.updated_at || new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Override pull - notification_preferences uses user_id as PK on remote.
   */
  async pull(since: string | null): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    const supabase = (await import('@/lib/supabase')).getSupabase();
    if (!supabase) return 0;

    const session = await (await import('@/lib/auth')).getFullSession();
    if (!session) return 0;

    await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    let query = supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId);

    if (since) {
      query = query.gt('updated_at', since);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Failed to pull notification preferences:', error.message);
      return 0;
    }

    if (!data || data.length === 0) {
      return 0;
    }

    const remote = data[0];
    const local = await this.getPreferences();

    if (this.shouldAcceptRemote(remote as NotificationPreferences, local)) {
      const now = new Date().toISOString();

      if (local) {
        await this.localDataSource.customExecute(
          `UPDATE notification_preferences SET
            user_id = $1,
            notifications_enabled = $2,
            monthly_checkin_enabled = $3,
            monthly_checkin_cron = $4,
            progress_updates_enabled = $5,
            progress_updates_cron = $6,
            why_reminders_enabled = $7,
            why_reminders_cron = $8,
            quiet_hours_enabled = $9,
            quiet_hours_start = $10,
            quiet_hours_end = $11,
            updated_at = $12
           WHERE id = 1`,
          [
            userId,
            remote.notifications_enabled ? 1 : 0,
            remote.monthly_checkin_enabled ? 1 : 0,
            remote.monthly_checkin_cron || '0 9 2 * *',
            remote.progress_updates_enabled ? 1 : 0,
            remote.progress_updates_cron || '0 10 * * 1',
            remote.why_reminders_enabled ? 1 : 0,
            remote.why_reminders_cron || '0 19 * * 1',
            remote.quiet_hours_enabled ? 1 : 0,
            remote.quiet_hours_start || '22:00',
            remote.quiet_hours_end || '08:00',
            remote.updated_at,
          ]
        );
      } else {
        await this.localDataSource.customExecute(
          `INSERT INTO notification_preferences (
            id, user_id, notifications_enabled,
            monthly_checkin_enabled, monthly_checkin_cron,
            progress_updates_enabled, progress_updates_cron,
            why_reminders_enabled, why_reminders_cron,
            quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
            created_at, updated_at
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            userId,
            remote.notifications_enabled ? 1 : 0,
            remote.monthly_checkin_enabled ? 1 : 0,
            remote.monthly_checkin_cron || '0 9 2 * *',
            remote.progress_updates_enabled ? 1 : 0,
            remote.progress_updates_cron || '0 10 * * 1',
            remote.why_reminders_enabled ? 1 : 0,
            remote.why_reminders_cron || '0 19 * * 1',
            remote.quiet_hours_enabled ? 1 : 0,
            remote.quiet_hours_start || '22:00',
            remote.quiet_hours_end || '08:00',
            remote.created_at || now,
            remote.updated_at,
          ]
        );
      }

      await this.notifyListeners();
      return 1;
    }

    return 0;
  }
}
