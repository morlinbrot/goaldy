import { getBrowserDatabase } from "./browser-database";
import { isTauri } from "./platform";

// Database interface that both Tauri SQLite and BrowserDatabase implement
interface DatabaseInterface {
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

let db: DatabaseInterface | null = null;
let dbInitPromise: Promise<DatabaseInterface> | null = null;

/**
 * Get or initialize the database connection.
 * Uses Tauri SQLite plugin in desktop app, or sql.js in browser.
 */
export async function getDatabase(): Promise<DatabaseInterface> {
  // Use a promise to prevent concurrent initialization
  if (dbInitPromise) {
    return dbInitPromise;
  }

  if (db) {
    return db;
  }

  dbInitPromise = (async () => {
    if (!db) {
      if (isTauri()) {
        // Use Tauri SQLite plugin
        const Database = (await import("@tauri-apps/plugin-sql")).default;
        db = await Database.load("sqlite:goaldy.db");
      } else {
        // Use browser sql.js database
        const browserDb = getBrowserDatabase();
        await browserDb.init();
        db = browserDb;
      }
    }

    return db;
  })();

  const result = await dbInitPromise;
  dbInitPromise = null;
  return result;
}
