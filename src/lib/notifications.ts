import { getBrowserDatabase } from './browser-database';
import { getNextExecutionTime } from './cron';
import { isTauri } from './platform';
import { generateId } from './types';

// Database interface that both Tauri SQLite and BrowserDatabase implement
interface DatabaseInterface {
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

// Notification types
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

export interface ScheduledNotification {
  id: string;
  user_id: string | null;
  notification_type: NotificationType;
  goal_id: string | null;
  title: string;
  body: string;
  scheduled_at: string;
  cron_expression: string | null;
  sent_at: string | null;
  created_at: string;
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
      // Use Tauri SQLite plugin
      const Database = (await import("@tauri-apps/plugin-sql")).default;
      notifDb = await Database.load("sqlite:goaldy.db");
    } else {
      // Use browser sql.js database
      const browserDb = getBrowserDatabase();
      await browserDb.init();
      notifDb = browserDb;
    }
  }
  return notifDb;
}

// Lazy imports to avoid circular dependencies
let _getCurrentUserId: (() => Promise<string | null>) | null = null;
let _queueChange: ((tableName: string, recordId: string, operation: 'insert' | 'update' | 'delete', payload: object) => Promise<void>) | null = null;

async function getCurrentUserId(): Promise<string | null> {
  if (!_getCurrentUserId) {
    const auth = await import('./auth');
    _getCurrentUserId = auth.getCurrentUserId;
  }
  return _getCurrentUserId();
}

async function queueChange(tableName: string, recordId: string, operation: 'insert' | 'update' | 'delete', payload: object): Promise<void> {
  if (!_queueChange) {
    const sync = await import('./sync');
    _queueChange = sync.queueChange;
  }
  return _queueChange(tableName, recordId, operation, payload);
}

export type PermissionStatus = 'granted' | 'denied' | 'unavailable';

/**
 * Check if notifications are supported and permission is granted.
 * Returns 'unavailable' if the notification system cannot be accessed.
 */
export async function checkNotificationPermission(): Promise<PermissionStatus> {
  if (isTauri()) {
    try {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
      const granted = await isPermissionGranted();
      return granted ? 'granted' : 'denied';
    } catch (error) {
      console.error('Failed to check notification permission:', error);
      return 'unavailable';
    }
  } else {
    // Browser mode - check Web Notifications API
    if (!('Notification' in window)) {
      return 'unavailable';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      return 'denied';
    }
    return 'denied'; // 'default' state - not yet requested
  }
}

/**
 * Request notification permission from the user.
 * Returns 'unavailable' if the notification system cannot be accessed.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  if (isTauri()) {
    try {
      const { requestPermission } = await import('@tauri-apps/plugin-notification');
      const permission = await requestPermission();
      return permission === 'granted' ? 'granted' : 'denied';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'unavailable';
    }
  } else {
    // Browser mode - use Web Notifications API
    if (!('Notification' in window)) {
      return 'unavailable';
    }
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted' ? 'granted' : 'denied';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'unavailable';
    }
  }
}

/**
 * Send an immediate notification.
 */
export async function showNotification(title: string, body: string): Promise<void> {
  const permissionStatus = await checkNotificationPermission();
  if (permissionStatus !== 'granted') {
    console.warn('Notification permission not granted:', permissionStatus);
    return;
  }

  if (isTauri()) {
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      await sendNotification({ title, body });
      console.log(`[Notifications] Sent: "${title}"`);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  } else {
    // Browser mode - use Web Notifications API
    try {
      new Notification(title, { body });
      console.log(`[Notifications] Sent: "${title}"`);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}

/**
 * Schedule a notification with a cron expression.
 */
export async function scheduleNotification(
  title: string,
  body: string,
  cronExpression: string,
  type: NotificationType,
  goalId?: string
): Promise<string> {
  const permissionStatus = await checkNotificationPermission();
  if (permissionStatus !== 'granted') {
    throw new Error(`Notification permission not granted: ${permissionStatus}`);
  }

  const nextExecution = getNextExecutionTime(cronExpression);
  if (!nextExecution) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const db = await getNotificationDatabase();
  const userId = await getCurrentUserId();
  const nowStr = new Date().toISOString();
  const id = generateId();

  console.log(`[Notifications] Scheduling "${title}" with cron "${cronExpression}", next: ${nextExecution.toISOString()}`);

  await db.execute(
    `INSERT INTO scheduled_notifications (id, user_id, notification_type, goal_id, title, body, scheduled_at, cron_expression, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, userId, type, goalId || null, title, body, nextExecution.toISOString(), cronExpression, nowStr, nowStr]
  );

  return id;
}

/**
 * Cancel all scheduled notifications of a specific type.
 */
export async function cancelNotificationsByType(type: NotificationType): Promise<void> {
  const db = await getNotificationDatabase();
  await db.execute(
    `DELETE FROM scheduled_notifications WHERE notification_type = $1 AND sent_at IS NULL`,
    [type]
  );
  console.log(`[Notifications] Cancelled all ${type} notifications`);
}

/**
 * Get all pending scheduled notifications.
 */
export async function getScheduledNotifications(): Promise<ScheduledNotification[]> {
  const db = await getNotificationDatabase();
  return db.select<ScheduledNotification[]>(
    `SELECT * FROM scheduled_notifications WHERE sent_at IS NULL ORDER BY scheduled_at ASC`
  );
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

/**
 * Check if current time is within quiet hours.
 */
export function isWithinQuietHours(prefs: NotificationPreferences): boolean {
  if (!prefs.quiet_hours_enabled) return false;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { quiet_hours_start: start, quiet_hours_end: end } = prefs;

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  return currentTime >= start && currentTime < end;
}

/**
 * Check for due notifications and send them.
 */
export async function checkAndSendDueNotifications(): Promise<void> {
  const db = await getNotificationDatabase();
  const now = new Date();
  const nowStr = now.toISOString();

  const prefs = await getNotificationPreferences();

  if (!prefs.notifications_enabled) {
    console.log('[Notifications] Skipping check - notifications disabled');
    return;
  }

  if (isWithinQuietHours(prefs)) {
    console.log('[Notifications] Skipping check - quiet hours active');
    return;
  }

  const dueNotifications = await db.select<ScheduledNotification[]>(
    `SELECT * FROM scheduled_notifications
     WHERE scheduled_at <= $1 AND sent_at IS NULL
     ORDER BY scheduled_at ASC`,
    [nowStr]
  );

  console.log(`[Notifications] Found ${dueNotifications.length} due notifications`);

  for (const notification of dueNotifications) {
    console.log(`[Notifications] Processing: "${notification.title}" (scheduled: ${notification.scheduled_at})`);

    try {
      await showNotification(notification.title, notification.body);

      await db.execute(
        `UPDATE scheduled_notifications SET sent_at = $1 WHERE id = $2`,
        [nowStr, notification.id]
      );

      // Reschedule recurring notifications
      if (notification.cron_expression) {
        const nextExecution = getNextExecutionTime(notification.cron_expression);
        if (nextExecution) {
          console.log(`[Notifications] Next occurrence: ${nextExecution.toISOString()}`);
          await db.execute(
            `INSERT INTO scheduled_notifications (id, user_id, notification_type, goal_id, title, body, scheduled_at, cron_expression, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              generateId(),
              notification.user_id,
              notification.notification_type,
              notification.goal_id,
              notification.title,
              notification.body,
              nextExecution.toISOString(),
              notification.cron_expression,
              nowStr,
              nowStr
            ]
          );
        }
      }
    } catch (error) {
      console.error(`Failed to send notification ${notification.id}:`, error);
    }
  }
}

/**
 * Clean up old sent notifications (older than 30 days).
 */
export async function cleanupOldNotifications(): Promise<void> {
  const db = await getNotificationDatabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  await db.execute(
    `DELETE FROM scheduled_notifications WHERE sent_at IS NOT NULL AND sent_at < $1`,
    [cutoff.toISOString()]
  );
}
