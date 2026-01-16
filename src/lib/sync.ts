import { getCurrentUserId, getFullSession, getLocalAuthState, updateLastSyncAt } from './auth';
import { getDatabase } from './database';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Budget, Expense, SyncOperation, SyncQueueItem, SyncResult, SyncStatus } from './types';
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

  return db.select<SyncQueueItem[]>(
    `SELECT * FROM sync_queue
     WHERE user_id = $1 AND attempts < $2
     ORDER BY created_at ASC`,
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

    // Update last sync timestamp
    const now = new Date().toISOString();
    await updateLastSyncAt(now);

  } catch (error) {
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
  const localResult = await db.select<Budget[]>(
    `SELECT * FROM budgets WHERE id = $1`,
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
        `UPDATE budgets SET
          total_amount = $1, spending_limit = $2, updated_at = $3, deleted_at = $4, user_id = $5
         WHERE id = $6`,
        [
          remote.total_amount,
          remote.spending_limit,
          remote.updated_at,
          remote.deleted_at,
          userId,
          remote.id,
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

/**
 * Clear all items from the sync queue.
 */
export async function clearSyncQueue(): Promise<void> {
  const db = await getDatabase();
  const userId = await getCurrentUserId();
  if (userId) {
    await db.execute(`DELETE FROM sync_queue WHERE user_id = $1`, [userId]);
  }
}
