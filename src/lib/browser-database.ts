/**
 * Browser-compatible database implementation using sql.js (SQLite compiled to WASM).
 *
 * This provides full SQLite support in the browser, matching the Tauri SQLite plugin API.
 * Data is persisted to IndexedDB as a binary blob.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

// IndexedDB is used only for persisting the sql.js database binary
const DB_NAME = 'goaldy-sqlite';
const DB_VERSION = 2; // Bump version to recreate object store with correct name
const DB_STORE_NAME = 'sqlitedb';
const DB_KEY = 'data';

let sqlJsDb: SqlJsDatabase | null = null;
let dbInitPromise: Promise<void> | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Convert PostgreSQL-style parameters ($1, $2) to SQLite-style (?)
 * and reorder params array accordingly.
 */
function convertParams(query: string, params: unknown[]): { query: string; params: unknown[] } {
  // Find all $N references and their positions
  const paramRefs: { index: number; paramNum: number }[] = [];
  const regex = /\$(\d+)/g;
  let match;

  while ((match = regex.exec(query)) !== null) {
    paramRefs.push({ index: match.index, paramNum: parseInt(match[1], 10) });
  }

  // If no params, return as-is
  if (paramRefs.length === 0) {
    return { query, params };
  }

  // Build new params array in order of appearance
  const newParams: unknown[] = [];
  for (const ref of paramRefs) {
    newParams.push(params[ref.paramNum - 1]);
  }

  // Replace all $N with ?
  const newQuery = query.replace(/\$\d+/g, '?');

  return { query: newQuery, params: newParams };
}

/**
 * Open IndexedDB for storing the database binary.
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Delete old object stores from previous versions
      for (const name of Array.from(db.objectStoreNames)) {
        if (name !== DB_STORE_NAME) {
          db.deleteObjectStore(name);
        }
      }
      // Create our object store
      if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
        db.createObjectStore(DB_STORE_NAME);
      }
    };
  });
}

/**
 * Load database binary from IndexedDB.
 */
async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(DB_STORE_NAME, 'readonly');
      const store = transaction.objectStore(DB_STORE_NAME);
      const request = store.get(DB_KEY);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load from IndexedDB:', error);
    return null;
  }
}

/**
 * Save database binary to IndexedDB.
 */
async function saveToIndexedDB(): Promise<void> {
  if (!sqlJsDb) return;

  try {
    const data = sqlJsDb.export();
    const idb = await openIndexedDB();

    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(DB_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(DB_STORE_NAME);
      const request = store.put(data, DB_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save to IndexedDB:', error);
  }
}

/**
 * Schedule a debounced save to IndexedDB.
 */
function scheduleSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveToIndexedDB();
    saveTimeout = null;
  }, 100);
}

/**
 * Initialize the sql.js database.
 */
async function initDatabase(): Promise<void> {
  if (sqlJsDb) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    // Initialize sql.js with WASM
    // Use CDN for the WASM file to avoid bundling issues
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    // Try to load existing database from IndexedDB
    const existingData = await loadFromIndexedDB();

    if (existingData) {
      sqlJsDb = new SQL.Database(existingData);
    } else {
      sqlJsDb = new SQL.Database();
    }

    // Set up beforeunload handler to save on page close
    window.addEventListener('beforeunload', () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      if (sqlJsDb) {
        const data = sqlJsDb.export();
        // Use synchronous localStorage as fallback for beforeunload
        // IndexedDB may not complete in time
        try {
          const idb = indexedDB.open(DB_NAME, 1);
          idb.onsuccess = () => {
            const db = idb.result;
            const tx = db.transaction(DB_STORE_NAME, 'readwrite');
            tx.objectStore(DB_STORE_NAME).put(data, DB_KEY);
          };
        } catch {
          // Best effort save
        }
      }
    });
  })();

  return dbInitPromise;
}

/**
 * Transform sql.js results to array of objects.
 * sql.js returns: [{ columns: ['id', 'name'], values: [[1, 'foo'], [2, 'bar']] }]
 * We need: [{id: 1, name: 'foo'}, {id: 2, name: 'bar'}]
 */
function transformResults<T>(results: { columns: string[]; values: unknown[][] }[]): T[] {
  if (results.length === 0) return [];

  const { columns, values } = results[0];
  return values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as T;
  });
}

/**
 * Browser Database class that mimics the Tauri SQLite plugin API using sql.js.
 */
export class BrowserDatabase {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await initDatabase();
    this.initialized = true;
  }

  /**
   * Execute a SQL query (INSERT, UPDATE, DELETE, CREATE TABLE, etc.).
   */
  async execute(query: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    await this.init();

    if (!sqlJsDb) {
      throw new Error('Database not initialized');
    }

    const converted = convertParams(query, params);

    try {
      sqlJsDb.run(converted.query, converted.params as (string | number | null | Uint8Array)[]);
      const rowsAffected = sqlJsDb.getRowsModified();

      // Schedule save for write operations
      scheduleSave();

      return { rowsAffected };
    } catch (error) {
      console.error('SQL execute error:', error, { query, params });
      throw error;
    }
  }

  /**
   * Select records from the database.
   */
  async select<T>(query: string, params: unknown[] = []): Promise<T> {
    await this.init();

    if (!sqlJsDb) {
      throw new Error('Database not initialized');
    }

    const converted = convertParams(query, params);

    try {
      const results = sqlJsDb.exec(converted.query, converted.params as (string | number | null | Uint8Array)[]);
      return transformResults<T extends (infer U)[] ? U : T>(results) as T;
    } catch (error) {
      console.error('SQL select error:', error, { query, params });
      throw error;
    }
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

/**
 * Clear the database (useful for testing or reset).
 */
export async function clearBrowserDatabase(): Promise<void> {
  if (sqlJsDb) {
    sqlJsDb.close();
    sqlJsDb = null;
  }

  browserDbInstance = null;
  dbInitPromise = null;

  // Clear IndexedDB
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(DB_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(DB_STORE_NAME);
      const request = store.delete(DB_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear IndexedDB:', error);
  }
}
