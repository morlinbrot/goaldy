/**
 * Notification Preferences Management
 *
 * This module manages notification preferences that are synced to Supabase.
 * Actual push notifications are sent server-side via FCM (Firebase Cloud Messaging).
 *
 * The flow is:
 * 1. User configures preferences in the app
 * 2. Preferences sync to Supabase
 * 3. Supabase Edge Functions check preferences and send FCM pushes
 * 4. FCM delivers to the user's device
 */

import { getBrowserDatabase } from './browser-database';
import { isTauri } from './platform';

// Database interface
interface DatabaseInterface {
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

// Notification types (for reference - actual sending is server-side)
export type NotificationType = 'monthly_checkin' | 'progress_update' | 'why_reminder' | 'habit_alert' | 'habit_milestone';

// Default cron expressions
export const DEFAULT_MONTHLY_CRON = '0 9 2 * *';     // 2nd of month at 09:00
export const DEFAULT_PROGRESS_CRON = '0 10 * * 1';  // Weekly on Monday at 10:00
export const DEFAULT_WHY_CRON = '0 19 * * 1';       // Weekly on Monday at 19:00

export interface NotificationPreferences {
  id: number;
  user_id: string | null;
  notifications_enabled: boolean;
  // Monthly check-in (cron encodes day + time)
  monthly_checkin_enabled: boolean;
  monthly_checkin_cron: string;
  // Progress updates (cron encodes frequency + time)
  progress_updates_enabled: boolean;
  progress_updates_cron: string;
  // Why reminders (cron encodes frequency + time)
  why_reminders_enabled: boolean;
  why_reminders_cron: string;
  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  // Timestamps
  created_at: string;
  updated_at: string;
}

// Raw database row type (SQLite stores booleans as integers)
interface NotificationPreferencesRow {
  id: number;
  user_id: string | null;
  notifications_enabled: number;
  monthly_checkin_enabled: number;
  monthly_checkin_cron: string | null;
  progress_updates_enabled: number;
  progress_updates_cron: string | null;
  why_reminders_enabled: number;
  why_reminders_cron: string | null;
  quiet_hours_enabled: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  created_at: string;
  updated_at: string;
}

// Default preferences
export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  notifications_enabled: true,
  monthly_checkin_enabled: true,
  monthly_checkin_cron: DEFAULT_MONTHLY_CRON,
  progress_updates_enabled: true,
  progress_updates_cron: DEFAULT_PROGRESS_CRON,
  why_reminders_enabled: true,
  why_reminders_cron: DEFAULT_WHY_CRON,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
};

// Database instance
let notifDb: DatabaseInterface | null = null;

async function getNotificationDatabase(): Promise<DatabaseInterface> {
  if (!notifDb) {
    if (isTauri()) {
      const Database = (await import("@tauri-apps/plugin-sql")).default;
      notifDb = await Database.load("sqlite:goaldy.db");
    } else {
      const browserDb = getBrowserDatabase();
      await browserDb.init();
      notifDb = browserDb;
    }
  }
  return notifDb;
}

// Lazy imports to avoid circular dependencies
let _getCurrentUserId: (() => Promise<string | null>) | null = null;

async function getCurrentUserId(): Promise<string | null> {
  if (!_getCurrentUserId) {
    const auth = await import('./auth');
    _getCurrentUserId = auth.getCurrentUserId;
  }
  return _getCurrentUserId();
}

async function queueChange(tableName: string, recordId: string, operation: 'insert' | 'update' | 'delete', payload: object): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { SyncQueue } = await import('@/lib/sync/services/SyncQueue');
  const { SYNC_TABLES } = await import('@/lib/sync/types');

  const syncTableName = tableName as keyof typeof SYNC_TABLES;
  if (!(syncTableName in SYNC_TABLES)) {
    console.warn(`[notifications] Unknown sync table: ${tableName}`);
    return;
  }

  const queue = new SyncQueue();
  await queue.enqueue(SYNC_TABLES[syncTableName], recordId, operation, payload, userId);
}

export type PermissionStatus = 'granted' | 'denied' | 'unavailable';

/**
 * Check if push notifications are available.
 * On Android with FCM, this checks if the FCM bridge is available.
 * On other platforms, returns 'unavailable'.
 */
export async function checkNotificationPermission(): Promise<PermissionStatus> {
  // Check if FCM is available (Android)
  if (typeof window !== 'undefined' && window.GoaldyFCM) {
    // FCM is available - Android handles permissions at the OS level
    // The user will be prompted by Android when first registering for notifications
    return 'granted';
  }

  // For browser/desktop, notifications are not supported via FCM
  // Return 'unavailable' since we're moving to server-side push
  return 'unavailable';
}

/**
 * Request notification permission.
 * On Android, this triggers the FCM token request which may prompt the user.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  if (typeof window !== 'undefined' && window.GoaldyFCM) {
    // Request FCM token - this will trigger Android permission prompt if needed
    window.GoaldyFCM.requestToken();
    return 'granted';
  }

  return 'unavailable';
}

/**
 * Convert database row to NotificationPreferences.
 */
function rowToPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    id: row.id,
    user_id: row.user_id,
    notifications_enabled: Boolean(row.notifications_enabled),
    monthly_checkin_enabled: Boolean(row.monthly_checkin_enabled),
    monthly_checkin_cron: row.monthly_checkin_cron || DEFAULT_MONTHLY_CRON,
    progress_updates_enabled: Boolean(row.progress_updates_enabled),
    progress_updates_cron: row.progress_updates_cron || DEFAULT_PROGRESS_CRON,
    why_reminders_enabled: Boolean(row.why_reminders_enabled),
    why_reminders_cron: row.why_reminders_cron || DEFAULT_WHY_CRON,
    quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
    quiet_hours_start: row.quiet_hours_start,
    quiet_hours_end: row.quiet_hours_end,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get notification preferences.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const db = await getNotificationDatabase();
  const result = await db.select<NotificationPreferencesRow[]>(
    `SELECT * FROM notification_preferences WHERE id = 1`
  );

  if (result[0]) {
    return rowToPreferences(result[0]);
  }

  const now = new Date().toISOString();
  return {
    id: 1,
    user_id: null,
    ...DEFAULT_PREFERENCES,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Save notification preferences.
 */
export async function saveNotificationPreferences(
  prefs: Partial<Omit<NotificationPreferences, 'id' | 'created_at' | 'updated_at'>>
): Promise<NotificationPreferences> {
  const db = await getNotificationDatabase();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  const existingRows = await db.select<{ id: number }[]>(
    `SELECT id FROM notification_preferences WHERE id = 1`
  );

  if (existingRows.length > 0) {
    const updates: string[] = ['updated_at = $1'];
    const params: (string | number | null)[] = [now];
    let paramIndex = 2;

    if (prefs.notifications_enabled !== undefined) {
      updates.push(`notifications_enabled = $${paramIndex++}`);
      params.push(prefs.notifications_enabled ? 1 : 0);
    }
    if (prefs.monthly_checkin_enabled !== undefined) {
      updates.push(`monthly_checkin_enabled = $${paramIndex++}`);
      params.push(prefs.monthly_checkin_enabled ? 1 : 0);
    }
    if (prefs.monthly_checkin_cron !== undefined) {
      updates.push(`monthly_checkin_cron = $${paramIndex++}`);
      params.push(prefs.monthly_checkin_cron);
    }
    if (prefs.progress_updates_enabled !== undefined) {
      updates.push(`progress_updates_enabled = $${paramIndex++}`);
      params.push(prefs.progress_updates_enabled ? 1 : 0);
    }
    if (prefs.progress_updates_cron !== undefined) {
      updates.push(`progress_updates_cron = $${paramIndex++}`);
      params.push(prefs.progress_updates_cron);
    }
    if (prefs.why_reminders_enabled !== undefined) {
      updates.push(`why_reminders_enabled = $${paramIndex++}`);
      params.push(prefs.why_reminders_enabled ? 1 : 0);
    }
    if (prefs.why_reminders_cron !== undefined) {
      updates.push(`why_reminders_cron = $${paramIndex++}`);
      params.push(prefs.why_reminders_cron);
    }
    if (prefs.quiet_hours_enabled !== undefined) {
      updates.push(`quiet_hours_enabled = $${paramIndex++}`);
      params.push(prefs.quiet_hours_enabled ? 1 : 0);
    }
    if (prefs.quiet_hours_start !== undefined) {
      updates.push(`quiet_hours_start = $${paramIndex++}`);
      params.push(prefs.quiet_hours_start);
    }
    if (prefs.quiet_hours_end !== undefined) {
      updates.push(`quiet_hours_end = $${paramIndex++}`);
      params.push(prefs.quiet_hours_end);
    }
    if (prefs.user_id !== undefined) {
      updates.push(`user_id = $${paramIndex++}`);
      params.push(prefs.user_id);
    }

    await db.execute(
      `UPDATE notification_preferences SET ${updates.join(', ')} WHERE id = 1`,
      params
    );
  } else {
    await db.execute(
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
        prefs.notifications_enabled !== undefined ? (prefs.notifications_enabled ? 1 : 0) : 1,
        prefs.monthly_checkin_enabled !== undefined ? (prefs.monthly_checkin_enabled ? 1 : 0) : 1,
        prefs.monthly_checkin_cron ?? DEFAULT_MONTHLY_CRON,
        prefs.progress_updates_enabled !== undefined ? (prefs.progress_updates_enabled ? 1 : 0) : 1,
        prefs.progress_updates_cron ?? DEFAULT_PROGRESS_CRON,
        prefs.why_reminders_enabled !== undefined ? (prefs.why_reminders_enabled ? 1 : 0) : 1,
        prefs.why_reminders_cron ?? DEFAULT_WHY_CRON,
        prefs.quiet_hours_enabled !== undefined ? (prefs.quiet_hours_enabled ? 1 : 0) : 0,
        prefs.quiet_hours_start ?? DEFAULT_PREFERENCES.quiet_hours_start,
        prefs.quiet_hours_end ?? DEFAULT_PREFERENCES.quiet_hours_end,
        now,
        now,
      ]
    );
  }

  const savedPrefs = await getNotificationPreferences();

  if (userId) {
    await queueChange('notification_preferences', userId, existingRows.length > 0 ? 'update' : 'insert', {
      ...savedPrefs,
      updated_at: now,
    });
  }

  return savedPrefs;
}

// Extend Window interface for FCM bridge
declare global {
  interface Window {
    GoaldyFCM?: {
      getToken(): string;
      requestToken(): void;
      isTokenSent(): boolean;
      markTokenSent(): void;
    };
  }
}
