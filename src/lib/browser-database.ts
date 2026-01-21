/**
 * Browser-compatible database implementation using IndexedDB.
 *
 * This provides a subset of the SQLite API for browser mode.
 * Data is stored in IndexedDB with a simple key-value structure per table.
 */

const DB_NAME = 'goaldy';
const DB_VERSION = 1;

// Table definitions with their key fields
const TABLES = [
  'budgets',
  'expenses',
  'categories',
  'savings_goals',
  'savings_contributions',
  'feedback_notes',
  'sync_queue',
  'auth_state',
  'notification_preferences',
  'scheduled_notifications',
] as const;

type TableName = typeof TABLES[number];

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database.
 */
async function initDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores for each table
      for (const tableName of TABLES) {
        if (!db.objectStoreNames.contains(tableName)) {
          db.createObjectStore(tableName, { keyPath: 'id' });
        }
      }
    };
  });

  return dbInitPromise;
}

/**
 * Get all records from a table.
 */
async function getAllFromTable<T>(tableName: TableName): Promise<T[]> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(tableName, 'readonly');
    const store = transaction.objectStore(tableName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a record by ID from a table.
 */
async function getById<T>(tableName: TableName, id: string | number): Promise<T | null> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(tableName, 'readonly');
    const store = transaction.objectStore(tableName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Put (insert or update) a record in a table.
 */
async function putRecord<T extends { id: string | number }>(tableName: TableName, record: T): Promise<void> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(tableName, 'readwrite');
    const store = transaction.objectStore(tableName);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a record from a table.
 */
async function deleteRecord(tableName: TableName, id: string | number): Promise<void> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(tableName, 'readwrite');
    const store = transaction.objectStore(tableName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all records from a table.
 * Prefixed with underscore to suppress unused variable warning - available for future use.
 */
async function _clearTable(tableName: TableName): Promise<void> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(tableName, 'readwrite');
    const store = transaction.objectStore(tableName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Export for potential future use
export { _clearTable as clearTable };

// Default categories for browser mode
const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#22c55e', is_custom: 0, is_hidden: 0, sort_order: 1, created_at: new Date().toISOString() },
  { id: 'dining', name: 'Dining', icon: '🍽️', color: '#f97316', is_custom: 0, is_hidden: 0, sort_order: 2, created_at: new Date().toISOString() },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#3b82f6', is_custom: 0, is_hidden: 0, sort_order: 3, created_at: new Date().toISOString() },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#a855f7', is_custom: 0, is_hidden: 0, sort_order: 4, created_at: new Date().toISOString() },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#ec4899', is_custom: 0, is_hidden: 0, sort_order: 5, created_at: new Date().toISOString() },
  { id: 'health', name: 'Health', icon: '💊', color: '#14b8a6', is_custom: 0, is_hidden: 0, sort_order: 6, created_at: new Date().toISOString() },
  { id: 'utilities', name: 'Utilities', icon: '💡', color: '#eab308', is_custom: 0, is_hidden: 0, sort_order: 7, created_at: new Date().toISOString() },
  { id: 'subscriptions', name: 'Subscriptions', icon: '📱', color: '#6366f1', is_custom: 0, is_hidden: 0, sort_order: 8, created_at: new Date().toISOString() },
  { id: 'other', name: 'Other', icon: '📦', color: '#64748b', is_custom: 0, is_hidden: 0, sort_order: 9, created_at: new Date().toISOString() },
];

/**
 * Initialize default categories if they don't exist.
 */
async function initializeCategories(): Promise<void> {
  const categories = await getAllFromTable('categories');
  if (categories.length === 0) {
    for (const category of DEFAULT_CATEGORIES) {
      await putRecord('categories', category);
    }
  }
}

/**
 * Browser Database class that mimics the Tauri SQLite plugin API.
 */
export class BrowserDatabase {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await initDatabase();
    await initializeCategories();
    this.initialized = true;
  }

  /**
   * Execute a SQL-like query (limited support for browser mode).
   * This is a simplified implementation that handles common patterns.
   */
  async execute(query: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    await this.init();

    const queryLower = query.toLowerCase().trim();

    // Handle INSERT
    if (queryLower.startsWith('insert into')) {
      const tableMatch = query.match(/insert into\s+(\w+)/i);
      if (!tableMatch) throw new Error('Invalid INSERT query');

      const tableName = tableMatch[1] as TableName;
      const record = this.parseInsertValues(query, params);
      await putRecord(tableName, record as { id: string | number });
      return { rowsAffected: 1 };
    }

    // Handle UPDATE
    if (queryLower.startsWith('update')) {
      const tableMatch = query.match(/update\s+(\w+)/i);
      if (!tableMatch) throw new Error('Invalid UPDATE query');

      const tableName = tableMatch[1] as TableName;
      const idMatch = this.extractIdFromWhere(query, params);

      if (idMatch) {
        const existing = await getById(tableName, idMatch);
        if (existing) {
          const updated = this.applyUpdates(existing, query, params);
          await putRecord(tableName, updated as { id: string | number });
          return { rowsAffected: 1 };
        }
      } else {
        // Bulk update (e.g., WHERE user_id IS NULL)
        const records = await getAllFromTable(tableName);
        let affected = 0;
        for (const record of records) {
          if (this.matchesWhereClause(record, query, params)) {
            const updated = this.applyUpdates(record, query, params);
            await putRecord(tableName, updated as { id: string | number });
            affected++;
          }
        }
        return { rowsAffected: affected };
      }
      return { rowsAffected: 0 };
    }

    // Handle DELETE
    if (queryLower.startsWith('delete from')) {
      const tableMatch = query.match(/delete from\s+(\w+)/i);
      if (!tableMatch) throw new Error('Invalid DELETE query');

      const tableName = tableMatch[1] as TableName;
      const idMatch = this.extractIdFromWhere(query, params);

      if (idMatch) {
        await deleteRecord(tableName, idMatch);
        return { rowsAffected: 1 };
      } else {
        // Bulk delete
        const records = await getAllFromTable(tableName);
        let affected = 0;
        for (const record of records) {
          if (this.matchesWhereClause(record, query, params)) {
            await deleteRecord(tableName, (record as { id: string | number }).id);
            affected++;
          }
        }
        return { rowsAffected: affected };
      }
    }

    console.warn('Unhandled query:', query);
    return { rowsAffected: 0 };
  }

  /**
   * Select records (limited SQL support).
   * Returns T directly where T is expected to be an array type (e.g., Budget[]).
   */
  async select<T>(query: string, params: unknown[] = []): Promise<T> {
    await this.init();

    const queryLower = query.toLowerCase();

    // Extract table name
    const tableMatch = query.match(/from\s+(\w+)/i);
    if (!tableMatch) throw new Error('Invalid SELECT query');

    const tableName = tableMatch[1] as TableName;
    // Get records as unknown[] and we'll cast at the end
    let records = await getAllFromTable<unknown>(tableName);

    // Handle JOINs (simplified - just return records with joined data)
    if (queryLower.includes('left join categories')) {
      const categories = await getAllFromTable<{ id: string; name: string; icon: string; color: string }>('categories');
      const categoryMap = new Map(categories.map(c => [c.id, c]));

      records = records.map((record: unknown) => {
        const r = record as { category_id?: string };
        const category = r.category_id ? categoryMap.get(r.category_id) : null;
        return {
          ...r,
          category_name: category?.name || null,
          category_icon: category?.icon || null,
          category_color: category?.color || null,
        };
      });
    }

    // Handle WHERE clause
    records = records.filter(record => this.matchesWhereClause(record, query, params));

    // Handle ORDER BY
    const orderMatch = query.match(/order by\s+([^\s,]+)(?:\s+(asc|desc))?/i);
    if (orderMatch) {
      const field = orderMatch[1].replace(/^\w+\./, ''); // Remove table prefix
      const direction = orderMatch[2]?.toLowerCase() === 'desc' ? -1 : 1;
      records.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[field] as string | number | null;
        const bVal = (b as Record<string, unknown>)[field] as string | number | null;
        if (aVal === null || bVal === null) return 0;
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });
    }

    // Handle LIMIT
    const limitMatch = query.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      records = records.slice(0, limit);
    }

    // Handle COUNT(*)
    if (queryLower.includes('count(*)')) {
      return [{ count: records.length }] as T;
    }

    // Handle SUM
    const sumMatch = query.match(/coalesce\(sum\((\w+)\),\s*0\)\s+as\s+(\w+)/i);
    if (sumMatch) {
      const field = sumMatch[1];
      const alias = sumMatch[2];
      const total = records.reduce((sum: number, record) => {
        return sum + ((record as Record<string, number>)[field] || 0);
      }, 0);
      return [{ [alias]: total }] as T;
    }

    return records as T;
  }

  /**
   * Parse INSERT VALUES into a record object.
   */
  private parseInsertValues(query: string, params: unknown[]): Record<string, unknown> {
    const columnsMatch = query.match(/\(([^)]+)\)\s*values/i);
    if (!columnsMatch) throw new Error('Invalid INSERT query format');

    const columns = columnsMatch[1].split(',').map(c => c.trim());
    const record: Record<string, unknown> = {};

    columns.forEach((col, index) => {
      record[col] = params[index];
    });

    return record;
  }

  /**
   * Extract ID from WHERE clause.
   */
  private extractIdFromWhere(query: string, params: unknown[]): string | number | null {
    const whereMatch = query.match(/where\s+id\s*=\s*\$(\d+)/i);
    if (whereMatch) {
      const paramIndex = parseInt(whereMatch[1], 10) - 1;
      return params[paramIndex] as string | number;
    }
    return null;
  }

  /**
   * Check if a record matches a WHERE clause (simplified).
   */
  private matchesWhereClause(record: unknown, query: string, params: unknown[]): boolean {
    const queryLower = query.toLowerCase();
    const r = record as Record<string, unknown>;

    // No WHERE clause = match all
    if (!queryLower.includes('where')) return true;

    // Handle deleted_at IS NULL
    if (queryLower.includes('deleted_at is null') && r.deleted_at !== null && r.deleted_at !== undefined) {
      return false;
    }

    // Handle is_hidden = 0
    if (queryLower.includes('is_hidden = 0') && r.is_hidden !== 0) {
      return false;
    }

    // Handle month = $X
    const monthMatch = query.match(/month\s*=\s*\$(\d+)/i);
    if (monthMatch) {
      const paramIndex = parseInt(monthMatch[1], 10) - 1;
      if (r.month !== params[paramIndex]) return false;
    }

    // Handle id = $X
    const idMatch = query.match(/where\s+\w*\.?id\s*=\s*\$(\d+)/i);
    if (idMatch) {
      const paramIndex = parseInt(idMatch[1], 10) - 1;
      if (r.id !== params[paramIndex]) return false;
    }

    // Handle goal_id = $X
    const goalIdMatch = query.match(/goal_id\s*=\s*\$(\d+)/i);
    if (goalIdMatch) {
      const paramIndex = parseInt(goalIdMatch[1], 10) - 1;
      if (r.goal_id !== params[paramIndex]) return false;
    }

    // Handle strftime('%Y-%m', date) = $X (for date filtering)
    const dateMatch = query.match(/strftime\('%Y-%m',\s*(\w+)\)\s*=\s*\$(\d+)/i);
    if (dateMatch) {
      const dateField = dateMatch[1];
      const paramIndex = parseInt(dateMatch[2], 10) - 1;
      const targetMonth = params[paramIndex] as string;
      const recordDate = r[dateField] as string;
      if (!recordDate || !recordDate.startsWith(targetMonth)) return false;
    }

    // Handle notification_type = $X
    const typeMatch = query.match(/notification_type\s*=\s*\$(\d+)/i);
    if (typeMatch) {
      const paramIndex = parseInt(typeMatch[1], 10) - 1;
      if (r.notification_type !== params[paramIndex]) return false;
    }

    // Handle sent_at IS NULL
    if (queryLower.includes('sent_at is null') && r.sent_at !== null && r.sent_at !== undefined) {
      return false;
    }

    // Handle user_id IS NULL
    if (queryLower.includes('user_id is null') && r.user_id !== null && r.user_id !== undefined) {
      return false;
    }

    return true;
  }

  /**
   * Apply UPDATE SET values to a record.
   */
  private applyUpdates(record: unknown, query: string, params: unknown[]): Record<string, unknown> {
    const r = { ...record as Record<string, unknown> };

    // Extract SET clause
    const setMatch = query.match(/set\s+(.+?)\s+where/i);
    if (!setMatch) return r;

    const setClauses = setMatch[1].split(',');

    for (const clause of setClauses) {
      const fieldMatch = clause.match(/(\w+)\s*=\s*\$(\d+)/);
      if (fieldMatch) {
        const field = fieldMatch[1];
        const paramIndex = parseInt(fieldMatch[2], 10) - 1;
        r[field] = params[paramIndex];
      }
    }

    return r;
  }
}

// Singleton instance
let browserDbInstance: BrowserDatabase | null = null;

/**
 * Get the browser database instance.
 */
export function getBrowserDatabase(): BrowserDatabase {
  if (!browserDbInstance) {
    browserDbInstance = new BrowserDatabase();
  }
  return browserDbInstance;
}
