import { getCurrentUserId, getFullSession, getLocalAuthState, updateLastSyncAt } from './auth';
import { getDatabase } from './database';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Budget, Expense, SavingsContribution, SavingsGoal, SyncOperation, SyncQueueItem, SyncResult, SyncStatus } from './types';
import { generateId } from './types';

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
  // 1. savings_goals must sync before savings_contributions (FK dependency)
  // 2. Then by created_at within each table
  return db.select<SyncQueueItem[]>(
    `SELECT * FROM sync_queue
     WHERE user_id = $1 AND attempts < $2
     ORDER BY
       CASE table_name
         WHEN 'savings_goals' THEN 1
         WHEN 'budgets' THEN 2
         WHEN 'expenses' THEN 3
         WHEN 'savings_contributions' THEN 4
         ELSE 5
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
