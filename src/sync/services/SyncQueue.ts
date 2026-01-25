/**
 * SyncQueue
 *
 * Manages the queue of pending sync operations with support for:
 * - Enqueuing new operations
 * - Dequeuing items respecting FK dependency order
 * - Retry tracking with exponential backoff
 * - Dead letter queue for permanently failed operations
 */

import { getDatabase } from '@/lib/database';
import { generateId } from '@/lib/types';
import {
    DeadLetterItem,
    SYNC_CONFIG,
    SYNC_TABLE_ORDER,
    SyncOperation,
    SyncQueueItem,
    SyncTableName,
} from '../types';

export class SyncQueue {
  /**
   * Add an operation to the sync queue.
   */
  async enqueue(
    tableName: SyncTableName,
    recordId: string,
    operation: SyncOperation,
    payload: object,
    userId: string
  ): Promise<void> {
    const db = await getDatabase();
    const id = generateId();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO sync_queue (id, table_name, record_id, operation, payload, user_id, created_at, attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [id, tableName, recordId, operation, JSON.stringify(payload), userId, now]
    );
  }

  /**
   * Get pending items to sync, ordered by FK dependencies then by creation time.
   * Only returns items that haven't exceeded max retry attempts.
   */
  async getPendingItems(userId: string, limit: number = 100): Promise<SyncQueueItem[]> {
    const db = await getDatabase();

    // Build ORDER BY clause based on FK dependency order
    const orderCases = SYNC_TABLE_ORDER
      .map((table, index) => `WHEN '${table}' THEN ${index}`)
      .join(' ');

    const items = await db.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue
       WHERE user_id = $1 AND attempts < $2
       ORDER BY
         CASE table_name ${orderCases} ELSE 99 END,
         created_at ASC
       LIMIT $3`,
      [userId, SYNC_CONFIG.MAX_RETRY_ATTEMPTS, limit]
    );

    return items;
  }

  /**
   * Get items for a specific table.
   */
  async getItemsByTable(
    userId: string,
    tableName: SyncTableName
  ): Promise<SyncQueueItem[]> {
    const db = await getDatabase();

    return db.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue
       WHERE user_id = $1 AND table_name = $2 AND attempts < $3
       ORDER BY created_at ASC`,
      [userId, tableName, SYNC_CONFIG.MAX_RETRY_ATTEMPTS]
    );
  }

  /**
   * Mark an item as successfully synced (remove from queue).
   */
  async markComplete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(`DELETE FROM sync_queue WHERE id = $1`, [id]);
  }

  /**
   * Mark an item as failed, incrementing retry count.
   * If max retries exceeded, moves to dead letter queue.
   */
  async markFailed(id: string, error: string): Promise<boolean> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Get current item
    const items = await db.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue WHERE id = $1`,
      [id]
    );

    if (items.length === 0) {
      return false;
    }

    const item = items[0];
    const newAttempts = item.attempts + 1;

    if (newAttempts >= SYNC_CONFIG.MAX_RETRY_ATTEMPTS) {
      // Move to dead letter queue
      await this.moveToDeadLetter(item, error);
      return true; // Indicates item was dead-lettered
    }

    // Update retry count
    await db.execute(
      `UPDATE sync_queue
       SET attempts = $1, last_attempt_at = $2, error_message = $3
       WHERE id = $4`,
      [newAttempts, now, error, id]
    );

    return false;
  }

  /**
   * Move a failed item to the dead letter queue.
   */
  async moveToDeadLetter(item: SyncQueueItem, finalError: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Insert into dead letter queue
    await db.execute(
      `INSERT INTO dead_letter_queue
       (id, table_name, record_id, operation, payload, user_id, created_at, attempts, failed_at, final_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        item.id,
        item.table_name,
        item.record_id,
        item.operation,
        item.payload,
        item.user_id,
        item.created_at,
        item.attempts + 1,
        now,
        finalError,
      ]
    );

    // Remove from sync queue
    await db.execute(`DELETE FROM sync_queue WHERE id = $1`, [item.id]);
  }

  /**
   * Get all items in the dead letter queue.
   */
  async getDeadLetterItems(userId: string): Promise<DeadLetterItem[]> {
    const db = await getDatabase();

    return db.select<DeadLetterItem[]>(
      `SELECT * FROM dead_letter_queue
       WHERE user_id = $1
       ORDER BY failed_at DESC`,
      [userId]
    );
  }

  /**
   * Retry a dead letter item by moving it back to the sync queue.
   */
  async retryDeadLetter(id: string): Promise<void> {
    const db = await getDatabase();

    // Get the dead letter item
    const items = await db.select<DeadLetterItem[]>(
      `SELECT * FROM dead_letter_queue WHERE id = $1`,
      [id]
    );

    if (items.length === 0) {
      throw new Error(`Dead letter item ${id} not found`);
    }

    const item = items[0];
    const now = new Date().toISOString();

    // Re-insert into sync queue with reset attempts
    await db.execute(
      `INSERT INTO sync_queue
       (id, table_name, record_id, operation, payload, user_id, created_at, attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [
        generateId(), // New ID to avoid conflicts
        item.table_name,
        item.record_id,
        item.operation,
        item.payload,
        item.user_id,
        now,
      ]
    );

    // Remove from dead letter queue
    await db.execute(`DELETE FROM dead_letter_queue WHERE id = $1`, [id]);
  }

  /**
   * Remove a dead letter item permanently.
   */
  async removeDeadLetter(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(`DELETE FROM dead_letter_queue WHERE id = $1`, [id]);
  }

  /**
   * Get count of pending items.
   */
  async getPendingCount(userId: string): Promise<number> {
    const db = await getDatabase();

    const result = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM sync_queue
       WHERE user_id = $1 AND attempts < $2`,
      [userId, SYNC_CONFIG.MAX_RETRY_ATTEMPTS]
    );

    return result[0]?.count || 0;
  }

  /**
   * Get count of dead letter items.
   */
  async getDeadLetterCount(userId: string): Promise<number> {
    const db = await getDatabase();

    const result = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM dead_letter_queue WHERE user_id = $1`,
      [userId]
    );

    return result[0]?.count || 0;
  }

  /**
   * Check if there are any pending changes.
   */
  async hasPendingChanges(userId: string): Promise<boolean> {
    const count = await this.getPendingCount(userId);
    return count > 0;
  }

  /**
   * Clear all pending items (for debugging/testing).
   */
  async clearAll(userId: string): Promise<number> {
    const db = await getDatabase();

    const result = await db.execute(
      `DELETE FROM sync_queue WHERE user_id = $1`,
      [userId]
    );

    return result.rowsAffected;
  }

  /**
   * Clear all dead letter items (for debugging/testing).
   */
  async clearDeadLetters(userId: string): Promise<number> {
    const db = await getDatabase();

    const result = await db.execute(
      `DELETE FROM dead_letter_queue WHERE user_id = $1`,
      [userId]
    );

    return result.rowsAffected;
  }
}
