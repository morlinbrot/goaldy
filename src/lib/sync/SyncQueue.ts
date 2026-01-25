// CREATE TABLE sync_queue (
//   id INTEGER PRIMARY KEY AUTOINCREMENT,
//   type TEXT NOT NULL,
//   operation TEXT NOT NULL,  -- 'create', 'update', 'delete'
//   timestamp INTEGER NOT NULL,
//   data TEXT NOT NULL  -- JSON stringified
// );

import { getDatabase } from "../lib/database";

export type SyncEntityType = "Expense" | "Budget";
export type SyncOperation = 'create' | 'update' | 'delete';

export type SyncQueueItem = {
  id: number;
  type: SyncEntityType;
  operation: SyncOperation;
  timestamp: number;
  data: string; // SQLite doesn't have JSON type
};

export class SyncQueue {
  async enqueue(type: SyncEntityType, operation: SyncOperation, data: object): Promise<void> {
    const database = await getDatabase();
    const timestamp = Date.now();

    await database.execute(
      `INSERT INTO sync_queue (type, operation, timestamp, data) VALUES ($1, $2, $3, $4)`,
      [type, operation, timestamp, JSON.stringify(data)]
    );
  }

  async dequeue(): Promise<SyncQueueItem | null> {
    const database = await getDatabase();

    const items = await database.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue ORDER BY timestamp ASC LIMIT 1`
    );

    if (items.length === 0) {
      return null;
    }

    const item = items[0];
    await database.execute(`DELETE FROM sync_queue WHERE id = $1`, [item.id]);

    return item;
  }

  async peek(): Promise<SyncQueueItem | null> {
    const database = await getDatabase();

    const items = await database.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue ORDER BY timestamp ASC LIMIT 1`
    );

    return items[0] || null;
  }

  async getAll(): Promise<SyncQueueItem[]> {
    const database = await getDatabase();

    return database.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue ORDER BY timestamp ASC`
    );
  }

  async getAllByType(type: SyncEntityType): Promise<SyncQueueItem[]> {
    const database = await getDatabase();

    const items = await database.select<SyncQueueItem[]>(
      `SELECT * FROM sync_queue WHERE type = $1 ORDER BY timestamp ASC`,
      [type]
    );

    return items;
  }

  async remove(id: string): Promise<void> {
    const database = await getDatabase();
    await database.execute(`DELETE FROM sync_queue WHERE id = $1`, [id]);
  }

  async clear(): Promise<void> {
    const database = await getDatabase();
    await database.execute(`DELETE FROM sync_queue`);
  }

  async count(): Promise<number> {
    const database = await getDatabase();

    const result = await database.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM sync_queue`
    );

    return result[0]?.count || 0;
  }
}
