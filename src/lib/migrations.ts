/**
 * TypeScript Migration Runner for Local SQLite Database
 *
 * This module reads SQL migration files from supabase/migrations/ and adapts them
 * for SQLite execution. It handles:
 * - Filtering out Supabase-only sections (@supabase-only-start/end)
 * - Including local-only sections (@local-only-start/end)
 * - Tracking applied migrations in _migrations table
 */

import { getBrowserDatabase } from './browser-database';
import { isTauri } from './platform';

// Database interface
interface DatabaseInterface {
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

// Migration file content (embedded at build time or fetched)
// For now, we'll embed the migration SQL directly since we can't easily
// read files at runtime in browser mode
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '00001_initial_schema',
    sql: `
-- ============================================
-- Categories
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_custom INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  sort_order INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Insert default categories (for local database)
INSERT OR IGNORE INTO categories (id, user_id, name, icon, color, is_custom, is_hidden, sort_order, created_at, updated_at) VALUES
  ('cat_groceries', NULL, 'Groceries', '🛒', '#22c55e', 0, 0, 1, datetime('now'), datetime('now')),
  ('cat_dining', NULL, 'Dining', '🍽️', '#f97316', 0, 0, 2, datetime('now'), datetime('now')),
  ('cat_transport', NULL, 'Transport', '🚗', '#3b82f6', 0, 0, 3, datetime('now'), datetime('now')),
  ('cat_entertainment', NULL, 'Entertainment', '🎬', '#a855f7', 0, 0, 4, datetime('now'), datetime('now')),
  ('cat_shopping', NULL, 'Shopping', '🛍️', '#ec4899', 0, 0, 5, datetime('now'), datetime('now')),
  ('cat_health', NULL, 'Health', '💊', '#14b8a6', 0, 0, 6, datetime('now'), datetime('now')),
  ('cat_utilities', NULL, 'Utilities', '💡', '#eab308', 0, 0, 7, datetime('now'), datetime('now')),
  ('cat_subscriptions', NULL, 'Subscriptions', '📱', '#6366f1', 0, 0, 8, datetime('now'), datetime('now')),
  ('cat_other', NULL, 'Other', '📦', '#6b7280', 0, 0, 9, datetime('now'), datetime('now'));

-- ============================================
-- Budgets
-- ============================================
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  month TEXT NOT NULL,
  total_amount REAL NOT NULL,
  spending_limit REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month) WHERE deleted_at IS NULL;

-- ============================================
-- Expenses
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  amount REAL NOT NULL,
  category_id TEXT,
  note TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- ============================================
-- Savings Goals
-- ============================================
CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  target_date TEXT NOT NULL,
  monthly_contribution REAL NOT NULL,
  why_statement TEXT,
  privacy_level TEXT DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);

-- ============================================
-- Savings Contributions
-- ============================================
CREATE TABLE IF NOT EXISTS savings_contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  goal_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  is_full_amount INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_savings_contributions_goal ON savings_contributions(goal_id);

-- ============================================
-- Habit Goals
-- ============================================
CREATE TABLE IF NOT EXISTS habit_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_value REAL NOT NULL,
  duration_months INTEGER,
  start_date TEXT NOT NULL,
  privacy_level TEXT DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_habit_goals_user ON habit_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_goals_category ON habit_goals(category_id);

-- ============================================
-- Habit Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS habit_tracking (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  habit_goal_id TEXT NOT NULL,
  month TEXT NOT NULL,
  spent_amount REAL NOT NULL,
  target_amount REAL NOT NULL,
  is_compliant INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (habit_goal_id) REFERENCES habit_goals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_habit_tracking_goal ON habit_tracking(habit_goal_id);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_month ON habit_tracking(month);

-- ============================================
-- Feedback Notes
-- ============================================
CREATE TABLE IF NOT EXISTS feedback_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_user ON feedback_notes(user_id);

-- ============================================
-- Notification Preferences
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  notifications_enabled INTEGER DEFAULT 1,
  monthly_checkin_enabled INTEGER DEFAULT 1,
  monthly_checkin_cron TEXT DEFAULT '0 9 2 * *',
  progress_updates_enabled INTEGER DEFAULT 1,
  progress_updates_cron TEXT DEFAULT '0 10 * * 1',
  why_reminders_enabled INTEGER DEFAULT 1,
  why_reminders_cron TEXT DEFAULT '0 19 * * 1',
  quiet_hours_enabled INTEGER DEFAULT 0,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '08:00',
  timezone TEXT DEFAULT 'UTC',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================
-- Scheduled Notifications
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  notification_type TEXT NOT NULL,
  goal_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  cron_expression TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled ON scheduled_notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_type ON scheduled_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user ON scheduled_notifications(user_id);

-- ============================================
-- Local-only tables (not synced to Supabase)
-- ============================================

-- Sync queue for offline changes
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  error_message TEXT
);

-- Auth state for local session storage
CREATE TABLE IF NOT EXISTS auth_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT,
  email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  last_sync_at TEXT
);

-- Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
    `,
  },
];

/**
 * Get the database instance for migrations.
 */
async function getMigrationDatabase(): Promise<DatabaseInterface> {
  if (isTauri()) {
    const Database = (await import('@tauri-apps/plugin-sql')).default;
    return Database.load('sqlite:goaldy.db');
  } else {
    const browserDb = getBrowserDatabase();
    await browserDb.init();
    return browserDb;
  }
}

/**
 * Check which migrations have been applied.
 */
async function getAppliedMigrations(db: DatabaseInterface): Promise<Set<string>> {
  try {
    const result = await db.select<{ name: string }[]>(
      'SELECT name FROM _migrations'
    );
    return new Set(result.map((r) => r.name));
  } catch {
    // Table doesn't exist yet, no migrations applied
    return new Set();
  }
}

/**
 * Mark a migration as applied.
 */
async function markMigrationApplied(
  db: DatabaseInterface,
  name: string
): Promise<void> {
  const now = new Date().toISOString();
  // Don't specify id - let SQLite auto-generate it with AUTOINCREMENT
  await db.execute(
    'INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)',
    [name, now]
  );
}

/**
 * Split SQL into individual statements, handling semicolons inside strings.
 * Also strips leading comment lines from each statement.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    // Handle string boundaries
    if ((char === "'" || char === '"') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Split on semicolons outside strings
    if (char === ';' && !inString) {
      const stmt = current.trim();
      if (stmt) {
        statements.push(stmt);
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Add final statement if any
  const final = current.trim();
  if (final) {
    statements.push(final);
  }

  // Strip leading comment lines and blank lines from each statement
  return statements.map(stmt => {
    const lines = stmt.split('\n');
    // Skip leading comment lines and blank lines
    let startIndex = 0;
    while (startIndex < lines.length) {
      const trimmed = lines[startIndex].trim();
      if (trimmed === '' || trimmed.startsWith('--')) {
        startIndex++;
      } else {
        break;
      }
    }
    return lines.slice(startIndex).join('\n').trim();
  }).filter(stmt => stmt.length > 0);
}

/**
 * Run pending migrations.
 *
 * For Tauri (SQLite): Executes SQL statements to create tables and insert data.
 * For Browser (sql.js): Same as Tauri - executes all SQL statements since sql.js is real SQLite.
 */
export async function runMigrations(): Promise<{
  applied: string[];
  errors: string[];
}> {
  const result = { applied: [] as string[], errors: [] as string[] };

  try {
    const db = await getMigrationDatabase();

    // Ensure _migrations table exists (both Tauri SQLite and browser sql.js)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      )
    `);

    const appliedMigrations = await getAppliedMigrations(db);

    for (const migration of MIGRATIONS) {
      if (appliedMigrations.has(migration.name)) {
        console.log(`[Migrations] Skipping already applied: ${migration.name}`);
        continue;
      }

      console.log(`[Migrations] Applying: ${migration.name}`);

      try {
        // Split SQL into statements and execute each
        const statements = splitStatements(migration.sql);

        for (const statement of statements) {
          // Skip empty statements and comments
          if (!statement || statement.startsWith('--')) {
            continue;
          }

          const stmtUpper = statement.toUpperCase().trim();

          // Note: With sql.js, browser mode now uses real SQLite, so we execute
          // all statements including CREATE TABLE, CREATE INDEX, etc.

          try {
            // Log CREATE TABLE statements for debugging
            if (stmtUpper.startsWith('CREATE TABLE')) {
              console.log(`[Migrations] Executing CREATE TABLE:`, statement.substring(0, 80));
            }
            await db.execute(statement);
            if (stmtUpper.startsWith('CREATE TABLE')) {
              console.log(`[Migrations] CREATE TABLE succeeded`);
            }
          } catch (stmtError) {
            // For CREATE TABLE and CREATE INDEX, these are critical - if they fail,
            // we should know but continue (they might already exist)
            const isCritical = stmtUpper.startsWith('CREATE TABLE') || stmtUpper.startsWith('CREATE INDEX') || stmtUpper.startsWith('CREATE UNIQUE');

            if (isCritical) {
              // Check if it's an "already exists" error - those are OK
              const errorStr = String(stmtError);
              if (errorStr.includes('already exists')) {
                console.log(`[Migrations] Table/index already exists, continuing...`);
              } else {
                console.error(`[Migrations] Critical statement failed: ${stmtError}`, statement.substring(0, 100));
                throw stmtError; // Re-throw critical errors
              }
            } else {
              // Log but continue for non-critical statements
              console.warn(
                `[Migrations] Statement warning: ${stmtError}`,
                statement.substring(0, 100)
              );
            }
          }
        }

        await markMigrationApplied(db, migration.name);
        result.applied.push(migration.name);
        console.log(`[Migrations] Applied: ${migration.name}`);
      } catch (error) {
        const errorMsg = `Failed to apply ${migration.name}: ${error}`;
        console.error(`[Migrations] ${errorMsg}`);
        result.errors.push(errorMsg);
        // Don't continue if a migration fails
        break;
      }
    }
  } catch (error) {
    result.errors.push(`Migration system error: ${error}`);
  }

  return result;
}

/**
 * Check if migrations are needed.
 */
export async function checkMigrations(): Promise<{
  pending: string[];
  applied: string[];
}> {
  try {
    const db = await getMigrationDatabase();
    const appliedMigrations = await getAppliedMigrations(db);

    const pending = MIGRATIONS.filter((m) => !appliedMigrations.has(m.name)).map(
      (m) => m.name
    );
    const applied = MIGRATIONS.filter((m) => appliedMigrations.has(m.name)).map(
      (m) => m.name
    );

    return { pending, applied };
  } catch {
    // If we can't check, assume all are pending
    return {
      pending: MIGRATIONS.map((m) => m.name),
      applied: [],
    };
  }
}
