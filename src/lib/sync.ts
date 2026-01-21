import { getCurrentUserId, getFullSession, getLocalAuthState, updateLastSyncAt } from './auth';
import { getDatabase } from './database';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Budget, Category, Expense, FeedbackNote, HabitGoal, HabitTracking, SavingsContribution, SavingsGoal, SyncOperation, SyncQueueItem, SyncResult, SyncStatus } from './types';
import { generateId } from './types';

// Define NotificationPreferences interface here to avoid circular dependency with notifications.ts
interface NotificationPreferencesSync {
  id: number;
  user_id: string | null;
  notifications_enabled: boolean;
  monthly_checkin_enabled: boolean;
  monthly_checkin_cron: string;
  progress_updates_enabled: boolean;
  progress_updates_cron: string;
  why_reminders_enabled: boolean;
  why_reminders_cron: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  created_at: string;
  updated_at: string;
}

// Define ScheduledNotification interface for sync
interface ScheduledNotificationSync {
  id: string;
  user_id: string | null;
  notification_type: string;
  goal_id: string | null;
  title: string;
  body: string;
  scheduled_at: string;
  cron_expression: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const MAX_RETRY_ATTEMPTS = 5;

/**
 * Check if the app is online.
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Get the current sync status.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const db = await getDatabase();
  const userId = await getCurrentUserId();

  // Count pending sync items
  const pendingResult = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE user_id = $1 AND attempts < $2`,
    [userId, MAX_RETRY_ATTEMPTS]
  );

  const authState = await getLocalAuthState();

  return {
    isOnline: isOnline(),
    isSyncing: false, // This would be managed by a global state
    lastSyncAt: authState?.last_sync_at || null,
    pendingChanges: pendingResult[0]?.count || 0,
    error: null,
  };
}

/**
 * Queue a change for sync.
 */
export async function queueChange(
  tableName: string,
  recordId: string,
  operation: SyncOperation,
  payload: object
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    // Not authenticated, don't queue
    return;
  }

  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, user_id, created_at, attempts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
    [id, tableName, recordId, operation, JSON.stringify(payload), userId, now]
  );

  // Try to push immediately if online
  if (isOnline()) {
    // Fire and forget - don't block the UI
    pushChanges().catch(console.error);
  }
}

/**
 * Get pending sync queue items.
 */
async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const userId = await getCurrentUserId();

  if (!userId) return [];

  // Order by table priority to respect foreign key dependencies:
  // 1. categories must sync first (referenced by expenses, habit_goals)
  // 2. savings_goals must sync before savings_contributions (FK dependency)
  // 3. habit_goals must sync before habit_tracking (FK dependency)
  // 4. Then by created_at within each table
  return db.select<SyncQueueItem[]>(
    `SELECT * FROM sync_queue
     WHERE user_id = $1 AND attempts < $2
     ORDER BY
       CASE table_name
         WHEN 'categories' THEN 1
         WHEN 'savings_goals' THEN 2
         WHEN 'habit_goals' THEN 3
         WHEN 'budgets' THEN 4
         WHEN 'expenses' THEN 5
         WHEN 'savings_contributions' THEN 6
         WHEN 'habit_tracking' THEN 7
         WHEN 'feedback_notes' THEN 8
         WHEN 'notification_preferences' THEN 9
         WHEN 'scheduled_notifications' THEN 10
         ELSE 11
       END,
       created_at ASC`,
    [userId, MAX_RETRY_ATTEMPTS]
  );
}

/**
 * Mark a sync item as processed (remove from queue).
 */
async function removeSyncItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM sync_queue WHERE id = $1`, [id]);
}

/**
 * Mark a sync item as failed.
 */
async function markSyncItemFailed(id: string, error: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE sync_queue SET attempts = attempts + 1, last_attempt_at = $1, error_message = $2 WHERE id = $3`,
    [now, error, id]
  );
}

/**
 * Clear all items from the sync queue (for debugging/reset purposes).
 * Optionally reset only failed items by setting resetFailedOnly to true.
 */
export async function clearSyncQueue(resetFailedOnly = false): Promise<number> {
  const db = await getDatabase();
  const userId = await getCurrentUserId();

  if (!userId) return 0;

  if (resetFailedOnly) {
    // Reset failed items so they can be retried
    const result = await db.execute(
      `UPDATE sync_queue SET attempts = 0, error_message = NULL, last_attempt_at = NULL
       WHERE user_id = $1 AND attempts >= $2`,
      [userId, MAX_RETRY_ATTEMPTS]
    );
    return result.rowsAffected;
  } else {
    // Delete all pending sync items
    const result = await db.execute(
      `DELETE FROM sync_queue WHERE user_id = $1`,
      [userId]
    );
    return result.rowsAffected;
  }
}

/**
 * Get sync queue status for debugging.
 */
export async function getSyncQueueStatus(): Promise<{
  pending: number;
  failed: number;
  items: SyncQueueItem[];
}> {
  const db = await getDatabase();
  const userId = await getCurrentUserId();

  if (!userId) return { pending: 0, failed: 0, items: [] };

  const items = await db.select<SyncQueueItem[]>(
    `SELECT * FROM sync_queue WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );

  const pending = items.filter(i => i.attempts < MAX_RETRY_ATTEMPTS).length;
  const failed = items.filter(i => i.attempts >= MAX_RETRY_ATTEMPTS).length;

  return { pending, failed, items };
}

/**
 * Push local changes to Supabase.
 */
export async function pushChanges(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pushed: 0,
    pulled: 0,
    errors: [],
  };

  if (!isSupabaseConfigured() || !isOnline()) {
    return result;
  }

  const supabase = getSupabase();
  if (!supabase) return result;

  const session = await getFullSession();
  if (!session) {
    result.success = false;
    result.errors.push('Not authenticated');
    return result;
  }

  // Set the auth session for this request
  await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  const items = await getPendingSyncItems();

  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload);

      if (item.table_name === 'expenses') {
        await pushExpense(supabase, item, payload);
      } else if (item.table_name === 'budgets') {
        await pushBudget(supabase, item, payload);
      } else if (item.table_name === 'savings_goals') {
        await pushSavingsGoal(supabase, item, payload);
      } else if (item.table_name === 'savings_contributions') {
        await pushSavingsContribution(supabase, item, payload);
      } else if (item.table_name === 'notification_preferences') {
        await pushNotificationPreferences(supabase, item, payload);
      } else if (item.table_name === 'habit_goals') {
        await pushHabitGoal(supabase, item, payload);
      } else if (item.table_name === 'habit_tracking') {
        await pushHabitTracking(supabase, item, payload);
      } else if (item.table_name === 'categories') {
        await pushCategory(supabase, item, payload);
      } else if (item.table_name === 'feedback_notes') {
        await pushFeedbackNote(supabase, item, payload);
      } else if (item.table_name === 'scheduled_notifications') {
        await pushScheduledNotification(supabase, item, payload);
      }

      await removeSyncItem(item.id);
      result.pushed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await markSyncItemFailed(item.id, errorMessage);
      result.errors.push(`Failed to sync ${item.table_name}/${item.record_id}: ${errorMessage}`);
    }
  }

  if (result.errors.length > 0) {
    result.success = false;
  }

  return result;
}

/**
 * Push an expense to Supabase.
 */
async function pushExpense(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<Expense>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete - update deleted_at
    const { error } = await supabase
      .from('expenses')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('expenses')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        amount: payload.amount,
        category_id: payload.category_id,
        note: payload.note,
        date: payload.date,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a budget to Supabase.
 */
async function pushBudget(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<Budget>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('budgets')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('budgets')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        month: payload.month,
        total_amount: payload.total_amount,
        spending_limit: payload.spending_limit,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a savings goal to Supabase.
 */
async function pushSavingsGoal(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<SavingsGoal>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('savings_goals')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('savings_goals')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        name: payload.name,
        target_amount: payload.target_amount,
        target_date: payload.target_date,
        monthly_contribution: payload.monthly_contribution,
        why_statement: payload.why_statement,
        privacy_level: payload.privacy_level,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a savings contribution to Supabase.
 */
async function pushSavingsContribution(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<SavingsContribution>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('savings_contributions')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('savings_contributions')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        goal_id: payload.goal_id,
        month: payload.month,
        amount: payload.amount,
        is_full_amount: payload.is_full_amount,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push notification preferences to Supabase.
 * Note: notification_preferences uses user_id as primary key, not a separate id field.
 */
async function pushNotificationPreferences(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<NotificationPreferencesSync>
): Promise<void> {
  if (!supabase) return;

  // Notification preferences are always upsert (no soft delete)
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: item.user_id,
      notifications_enabled: payload.notifications_enabled,
      monthly_checkin_enabled: payload.monthly_checkin_enabled,
      monthly_checkin_cron: payload.monthly_checkin_cron,
      progress_updates_enabled: payload.progress_updates_enabled,
      progress_updates_cron: payload.progress_updates_cron,
      why_reminders_enabled: payload.why_reminders_enabled,
      why_reminders_cron: payload.why_reminders_cron,
      quiet_hours_enabled: payload.quiet_hours_enabled,
      quiet_hours_start: payload.quiet_hours_start,
      quiet_hours_end: payload.quiet_hours_end,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      updated_at: payload.updated_at || new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) throw new Error(error.message);
}

/**
 * Push a habit goal to Supabase.
 */
async function pushHabitGoal(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<HabitGoal>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('habit_goals')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('habit_goals')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        name: payload.name,
        category_id: payload.category_id,
        rule_type: payload.rule_type,
        rule_value: payload.rule_value,
        duration_months: payload.duration_months,
        start_date: payload.start_date,
        privacy_level: payload.privacy_level,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a habit tracking record to Supabase.
 */
async function pushHabitTracking(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<HabitTracking>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('habit_tracking')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('habit_tracking')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        habit_goal_id: payload.habit_goal_id,
        month: payload.month,
        spent_amount: payload.spent_amount,
        target_amount: payload.target_amount,
        is_compliant: payload.is_compliant,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a category to Supabase.
 * Only custom categories (user-created) are synced.
 */
async function pushCategory(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<Category>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('categories')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('categories')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        name: payload.name,
        icon: payload.icon,
        color: payload.color,
        is_custom: payload.is_custom,
        is_hidden: payload.is_hidden,
        sort_order: payload.sort_order,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a feedback note to Supabase.
 */
async function pushFeedbackNote(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<FeedbackNote & { user_id: string; updated_at: string; deleted_at: string | null }>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('feedback_notes')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('feedback_notes')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        content: payload.content,
        created_at: payload.created_at,
        updated_at: payload.updated_at || new Date().toISOString(),
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Push a scheduled notification to Supabase.
 */
async function pushScheduledNotification(
  supabase: ReturnType<typeof getSupabase>,
  item: SyncQueueItem,
  payload: Partial<ScheduledNotificationSync>
): Promise<void> {
  if (!supabase) return;

  if (item.operation === 'delete') {
    // Soft delete
    const { error } = await supabase
      .from('scheduled_notifications')
      .update({
        deleted_at: payload.deleted_at,
        updated_at: payload.updated_at || new Date().toISOString(),
      })
      .eq('id', item.record_id)
      .eq('user_id', item.user_id);

    if (error) throw new Error(error.message);
  } else {
    // Insert or update
    const { error } = await supabase
      .from('scheduled_notifications')
      .upsert({
        id: payload.id,
        user_id: item.user_id,
        notification_type: payload.notification_type,
        goal_id: payload.goal_id,
        title: payload.title,
        body: payload.body,
        scheduled_at: payload.scheduled_at,
        cron_expression: payload.cron_expression,
        sent_at: payload.sent_at,
        created_at: payload.created_at,
        updated_at: payload.updated_at || new Date().toISOString(),
        deleted_at: payload.deleted_at,
      }, {
        onConflict: 'id',
      });

    if (error) throw new Error(error.message);
  }
}

/**
 * Pull remote changes from Supabase.
 */
export async function pullChanges(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pushed: 0,
    pulled: 0,
    errors: [],
  };

  if (!isSupabaseConfigured() || !isOnline()) {
    return result;
  }

  const supabase = getSupabase();
  if (!supabase) return result;

  const session = await getFullSession();
  const userId = await getCurrentUserId();
  if (!session || !userId) {
    result.success = false;
    result.errors.push('Not authenticated');
    return result;
  }

  // Set the auth session
  await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  const authState = await getLocalAuthState();
  const lastSyncAt = authState?.last_sync_at;

  try {
    // Pull expenses
    let expensesQuery = supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      expensesQuery = expensesQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteExpenses, error: expensesError } = await expensesQuery;
    if (expensesError) throw new Error(expensesError.message);

    // Pull budgets
    let budgetsQuery = supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      budgetsQuery = budgetsQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteBudgets, error: budgetsError } = await budgetsQuery;
    if (budgetsError) throw new Error(budgetsError.message);

    // Pull savings goals
    let savingsGoalsQuery = supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      savingsGoalsQuery = savingsGoalsQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteSavingsGoals, error: savingsGoalsError } = await savingsGoalsQuery;
    if (savingsGoalsError) throw new Error(savingsGoalsError.message);

    // Pull savings contributions
    let savingsContributionsQuery = supabase
      .from('savings_contributions')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      savingsContributionsQuery = savingsContributionsQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteSavingsContributions, error: savingsContributionsError } = await savingsContributionsQuery;
    if (savingsContributionsError) throw new Error(savingsContributionsError.message);

    const db = await getDatabase();

    // Merge expenses
    for (const remoteExpense of remoteExpenses || []) {
      const merged = await mergeExpense(db, remoteExpense, userId);
      if (merged) result.pulled++;
    }

    // Merge budgets
    for (const remoteBudget of remoteBudgets || []) {
      const merged = await mergeBudget(db, remoteBudget, userId);
      if (merged) result.pulled++;
    }

    // Merge savings goals
    for (const remoteSavingsGoal of remoteSavingsGoals || []) {
      const merged = await mergeSavingsGoal(db, remoteSavingsGoal, userId);
      if (merged) result.pulled++;
    }

    // Merge savings contributions
    for (const remoteSavingsContribution of remoteSavingsContributions || []) {
      const merged = await mergeSavingsContribution(db, remoteSavingsContribution, userId);
      if (merged) result.pulled++;
    }

    // Pull notification preferences
    let notificationPrefsQuery = supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      notificationPrefsQuery = notificationPrefsQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteNotificationPrefs, error: notificationPrefsError } = await notificationPrefsQuery;
    if (notificationPrefsError) {
      // Table might not exist yet - log but don't fail
      console.warn('Failed to pull notification preferences:', notificationPrefsError.message);
    } else {
      // Merge notification preferences
      for (const remotePrefs of remoteNotificationPrefs || []) {
        const merged = await mergeNotificationPreferences(db, remotePrefs, userId);
        if (merged) result.pulled++;
      }
    }

    // Pull habit goals
    let habitGoalsQuery = supabase
      .from('habit_goals')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      habitGoalsQuery = habitGoalsQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteHabitGoals, error: habitGoalsError } = await habitGoalsQuery;
    if (habitGoalsError) {
      console.warn('Failed to pull habit goals:', habitGoalsError.message);
    } else {
      for (const remoteHabitGoal of remoteHabitGoals || []) {
        const merged = await mergeHabitGoal(db, remoteHabitGoal, userId);
        if (merged) result.pulled++;
      }
    }

    // Pull habit tracking
    let habitTrackingQuery = supabase
      .from('habit_tracking')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      habitTrackingQuery = habitTrackingQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteHabitTracking, error: habitTrackingError } = await habitTrackingQuery;
    if (habitTrackingError) {
      console.warn('Failed to pull habit tracking:', habitTrackingError.message);
    } else {
      for (const remoteTracking of remoteHabitTracking || []) {
        const merged = await mergeHabitTracking(db, remoteTracking, userId);
        if (merged) result.pulled++;
      }
    }

    // Pull categories (only user's custom categories, not default ones)
    let categoriesQuery = supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      categoriesQuery = categoriesQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteCategories, error: categoriesError } = await categoriesQuery;
    if (categoriesError) {
      console.warn('Failed to pull categories:', categoriesError.message);
    } else {
      for (const remoteCategory of remoteCategories || []) {
        const merged = await mergeCategory(db, remoteCategory, userId);
        if (merged) result.pulled++;
      }
    }

    // Pull feedback notes
    let feedbackNotesQuery = supabase
      .from('feedback_notes')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      feedbackNotesQuery = feedbackNotesQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteFeedbackNotes, error: feedbackNotesError } = await feedbackNotesQuery;
    if (feedbackNotesError) {
      console.warn('Failed to pull feedback notes:', feedbackNotesError.message);
    } else {
      for (const remoteNote of remoteFeedbackNotes || []) {
        const merged = await mergeFeedbackNote(db, remoteNote, userId);
        if (merged) result.pulled++;
      }
    }

    // Pull scheduled notifications
    let scheduledNotificationsQuery = supabase
      .from('scheduled_notifications')
      .select('*')
      .eq('user_id', userId);

    if (lastSyncAt) {
      scheduledNotificationsQuery = scheduledNotificationsQuery.gt('updated_at', lastSyncAt);
    }

    const { data: remoteScheduledNotifications, error: scheduledNotificationsError } = await scheduledNotificationsQuery;
    if (scheduledNotificationsError) {
      console.warn('Failed to pull scheduled notifications:', scheduledNotificationsError.message);
    } else {
      for (const remoteNotification of remoteScheduledNotifications || []) {
        const merged = await mergeScheduledNotification(db, remoteNotification, userId);
        if (merged) result.pulled++;
      }
    }

    // Update last sync timestamp
    const now = new Date().toISOString();
    await updateLastSyncAt(now);

  } catch (error) {
    console.error("[Sync error] ", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.success = false;
    result.errors.push(`Pull failed: ${errorMessage}`);
  }

  return result;
}

/**
 * Merge a remote expense with local data (last write wins).
 */
async function mergeExpense(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<Expense[]>(
    `SELECT * FROM expenses WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE expenses SET
          amount = $1, category_id = $2, note = $3, date = $4,
          updated_at = $5, synced_at = $6, deleted_at = $7, user_id = $8
         WHERE id = $9`,
        [
          remote.amount,
          remote.category_id,
          remote.note,
          remote.date,
          remote.updated_at,
          new Date().toISOString(),
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO expenses (id, user_id, amount, category_id, note, date, created_at, updated_at, synced_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          remote.id,
          userId,
          remote.amount,
          remote.category_id,
          remote.note,
          remote.date,
          remote.created_at,
          remote.updated_at,
          new Date().toISOString(),
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote budget with local data (last write wins).
 */
async function mergeBudget(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  // First check by ID
  const localByIdResult = await db.select<Budget[]>(
    `SELECT * FROM budgets WHERE id = $1`,
    [remote.id]
  );
  let local = localByIdResult[0];

  // If not found by ID, check by month (due to UNIQUE constraint on month)
  if (!local) {
    const localByMonthResult = await db.select<Budget[]>(
      `SELECT * FROM budgets WHERE month = $1`,
      [remote.month]
    );
    local = localByMonthResult[0];
  }

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing (use local.id in case we found it by month with a different ID)
      await db.execute(
        `UPDATE budgets SET
          id = $1, total_amount = $2, spending_limit = $3, updated_at = $4, deleted_at = $5, user_id = $6
         WHERE id = $7`,
        [
          remote.id,
          remote.total_amount,
          remote.spending_limit,
          remote.updated_at,
          remote.deleted_at,
          userId,
          local.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO budgets (id, user_id, month, total_amount, spending_limit, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          remote.id,
          userId,
          remote.month,
          remote.total_amount,
          remote.spending_limit,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote savings goal with local data (last write wins).
 */
async function mergeSavingsGoal(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<SavingsGoal[]>(
    `SELECT * FROM savings_goals WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE savings_goals SET
          name = $1, target_amount = $2, target_date = $3, monthly_contribution = $4,
          why_statement = $5, privacy_level = $6, updated_at = $7, deleted_at = $8, user_id = $9
         WHERE id = $10`,
        [
          remote.name,
          remote.target_amount,
          remote.target_date,
          remote.monthly_contribution,
          remote.why_statement,
          remote.privacy_level,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO savings_goals (id, user_id, name, target_amount, target_date, monthly_contribution, why_statement, privacy_level, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          remote.id,
          userId,
          remote.name,
          remote.target_amount,
          remote.target_date,
          remote.monthly_contribution,
          remote.why_statement,
          remote.privacy_level,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote savings contribution with local data (last write wins).
 */
async function mergeSavingsContribution(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<SavingsContribution[]>(
    `SELECT * FROM savings_contributions WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE savings_contributions SET
          goal_id = $1, month = $2, amount = $3, is_full_amount = $4,
          updated_at = $5, deleted_at = $6, user_id = $7
         WHERE id = $8`,
        [
          remote.goal_id,
          remote.month,
          remote.amount,
          remote.is_full_amount,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO savings_contributions (id, user_id, goal_id, month, amount, is_full_amount, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          remote.id,
          userId,
          remote.goal_id,
          remote.month,
          remote.amount,
          remote.is_full_amount,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge remote notification preferences with local data (last write wins).
 * Note: notification_preferences uses a single row with id=1 locally.
 */
async function mergeNotificationPreferences(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  // Local notification_preferences always has id=1
  const localResult = await db.select<NotificationPreferencesSync[]>(
    `SELECT * FROM notification_preferences WHERE id = 1`
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    const now = new Date().toISOString();

    if (local) {
      // Update existing
      await db.execute(
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
      // Insert new
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
    return true;
  }

  return false;
}

/**
 * Merge a remote habit goal with local data (last write wins).
 */
async function mergeHabitGoal(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<HabitGoal[]>(
    `SELECT * FROM habit_goals WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE habit_goals SET
          name = $1, category_id = $2, rule_type = $3, rule_value = $4,
          duration_months = $5, start_date = $6, privacy_level = $7,
          updated_at = $8, deleted_at = $9, user_id = $10
         WHERE id = $11`,
        [
          remote.name,
          remote.category_id,
          remote.rule_type,
          remote.rule_value,
          remote.duration_months,
          remote.start_date,
          remote.privacy_level,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO habit_goals (id, user_id, name, category_id, rule_type, rule_value, duration_months, start_date, privacy_level, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          remote.id,
          userId,
          remote.name,
          remote.category_id,
          remote.rule_type,
          remote.rule_value,
          remote.duration_months,
          remote.start_date,
          remote.privacy_level,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote habit tracking record with local data (last write wins).
 */
async function mergeHabitTracking(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<HabitTracking[]>(
    `SELECT * FROM habit_tracking WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE habit_tracking SET
          habit_goal_id = $1, month = $2, spent_amount = $3, target_amount = $4,
          is_compliant = $5, updated_at = $6, deleted_at = $7, user_id = $8
         WHERE id = $9`,
        [
          remote.habit_goal_id,
          remote.month,
          remote.spent_amount,
          remote.target_amount,
          remote.is_compliant,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO habit_tracking (id, user_id, habit_goal_id, month, spent_amount, target_amount, is_compliant, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          remote.id,
          userId,
          remote.habit_goal_id,
          remote.month,
          remote.spent_amount,
          remote.target_amount,
          remote.is_compliant,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote category with local data (last write wins).
 * Only syncs user-created categories (not default ones).
 */
async function mergeCategory(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<Category[]>(
    `SELECT * FROM categories WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE categories SET
          name = $1, icon = $2, color = $3, is_custom = $4, is_hidden = $5,
          sort_order = $6, updated_at = $7, deleted_at = $8, user_id = $9
         WHERE id = $10`,
        [
          remote.name,
          remote.icon,
          remote.color,
          remote.is_custom,
          remote.is_hidden,
          remote.sort_order,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO categories (id, user_id, name, icon, color, is_custom, is_hidden, sort_order, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          remote.id,
          userId,
          remote.name,
          remote.icon,
          remote.color,
          remote.is_custom,
          remote.is_hidden,
          remote.sort_order,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote feedback note with local data (last write wins).
 */
async function mergeFeedbackNote(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<FeedbackNote[]>(
    `SELECT * FROM feedback_notes WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local && (local as unknown as { updated_at: string }).updated_at
    ? new Date((local as unknown as { updated_at: string }).updated_at).getTime()
    : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE feedback_notes SET
          content = $1, updated_at = $2, deleted_at = $3, user_id = $4
         WHERE id = $5`,
        [
          remote.content,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO feedback_notes (id, user_id, content, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          remote.id,
          userId,
          remote.content,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Merge a remote scheduled notification with local data (last write wins).
 */
async function mergeScheduledNotification(
  db: Awaited<ReturnType<typeof getDatabase>>,
  remote: Record<string, unknown>,
  userId: string
): Promise<boolean> {
  const localResult = await db.select<ScheduledNotificationSync[]>(
    `SELECT * FROM scheduled_notifications WHERE id = $1`,
    [remote.id]
  );
  const local = localResult[0];

  const remoteUpdatedAt = new Date(remote.updated_at as string).getTime();
  const localUpdatedAt = local ? new Date(local.updated_at).getTime() : 0;

  // Remote is newer or doesn't exist locally
  if (!local || remoteUpdatedAt > localUpdatedAt) {
    if (local) {
      // Update existing
      await db.execute(
        `UPDATE scheduled_notifications SET
          notification_type = $1, goal_id = $2, title = $3, body = $4,
          scheduled_at = $5, cron_expression = $6, sent_at = $7,
          updated_at = $8, deleted_at = $9, user_id = $10
         WHERE id = $11`,
        [
          remote.notification_type,
          remote.goal_id,
          remote.title,
          remote.body,
          remote.scheduled_at,
          remote.cron_expression,
          remote.sent_at,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
        ]
      );
    } else {
      // Insert new
      await db.execute(
        `INSERT INTO scheduled_notifications (id, user_id, notification_type, goal_id, title, body, scheduled_at, cron_expression, sent_at, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          remote.id,
          userId,
          remote.notification_type,
          remote.goal_id,
          remote.title,
          remote.body,
          remote.scheduled_at,
          remote.cron_expression,
          remote.sent_at,
          remote.created_at,
          remote.updated_at,
          remote.deleted_at,
        ]
      );
    }
    return true;
  }

  return false;
}

/**
 * Full sync: pull remote changes, then push local changes.
 */
export async function fullSync(): Promise<SyncResult> {
  const combinedResult: SyncResult = {
    success: true,
    pushed: 0,
    pulled: 0,
    errors: [],
  };

  // Pull first (to get any remote changes)
  const pullResult = await pullChanges();
  combinedResult.pulled = pullResult.pulled;
  combinedResult.errors.push(...pullResult.errors);
  if (!pullResult.success) {
    combinedResult.success = false;
  }

  // Then push (to send local changes)
  const pushResult = await pushChanges();
  combinedResult.pushed = pushResult.pushed;
  combinedResult.errors.push(...pushResult.errors);
  if (!pushResult.success) {
    combinedResult.success = false;
  }

  return combinedResult;
}
