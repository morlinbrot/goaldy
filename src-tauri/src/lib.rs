use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: r#"
                -- Categories
                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT,
                    color TEXT,
                    is_custom INTEGER DEFAULT 0,
                    is_hidden INTEGER DEFAULT 0,
                    sort_order INTEGER,
                    created_at TEXT NOT NULL
                );

                -- Budget configuration
                CREATE TABLE IF NOT EXISTS budgets (
                    id TEXT PRIMARY KEY,
                    month TEXT NOT NULL UNIQUE,
                    total_amount REAL NOT NULL,
                    spending_limit REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                -- Expense entries
                CREATE TABLE IF NOT EXISTS expenses (
                    id TEXT PRIMARY KEY,
                    amount REAL NOT NULL,
                    category_id TEXT,
                    note TEXT,
                    date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    synced_at TEXT,
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                );

                -- Savings goals
                CREATE TABLE IF NOT EXISTS savings_goals (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    target_amount REAL NOT NULL,
                    target_date TEXT NOT NULL,
                    monthly_contribution REAL NOT NULL,
                    why_statement TEXT,
                    privacy_level TEXT DEFAULT 'private',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                -- Savings contributions (monthly check-ins)
                CREATE TABLE IF NOT EXISTS savings_contributions (
                    id TEXT PRIMARY KEY,
                    goal_id TEXT NOT NULL,
                    month TEXT NOT NULL,
                    amount REAL NOT NULL,
                    is_full_amount INTEGER,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (goal_id) REFERENCES savings_goals(id)
                );

                -- Habit goals
                CREATE TABLE IF NOT EXISTS habit_goals (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category_id TEXT,
                    rule_type TEXT NOT NULL,
                    rule_value REAL NOT NULL,
                    duration_months INTEGER,
                    start_date TEXT NOT NULL,
                    privacy_level TEXT DEFAULT 'private',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                );

                -- Sync queue for offline changes
                CREATE TABLE IF NOT EXISTS sync_queue (
                    id TEXT PRIMARY KEY,
                    table_name TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                -- Insert default categories
                INSERT OR IGNORE INTO categories (id, name, icon, color, is_custom, sort_order, created_at) VALUES
                    ('cat_groceries', 'Groceries', '🛒', '#22c55e', 0, 1, datetime('now')),
                    ('cat_dining', 'Dining', '🍽️', '#f97316', 0, 2, datetime('now')),
                    ('cat_transport', 'Transport', '🚗', '#3b82f6', 0, 3, datetime('now')),
                    ('cat_entertainment', 'Entertainment', '🎬', '#a855f7', 0, 4, datetime('now')),
                    ('cat_shopping', 'Shopping', '🛍️', '#ec4899', 0, 5, datetime('now')),
                    ('cat_health', 'Health', '💊', '#14b8a6', 0, 6, datetime('now')),
                    ('cat_utilities', 'Utilities', '💡', '#eab308', 0, 7, datetime('now')),
                    ('cat_subscriptions', 'Subscriptions', '📱', '#6366f1', 0, 8, datetime('now')),
                    ('cat_other', 'Other', '📦', '#6b7280', 0, 9, datetime('now'));
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add feedback notes table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS feedback_notes (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add user_id and sync fields for cloud sync",
            sql: r#"
                -- Add user_id to expenses (nullable for offline-first)
                ALTER TABLE expenses ADD COLUMN user_id TEXT;

                -- Add user_id to budgets
                ALTER TABLE budgets ADD COLUMN user_id TEXT;

                -- Add deleted_at for soft deletes (sync-friendly)
                ALTER TABLE expenses ADD COLUMN deleted_at TEXT;
                ALTER TABLE budgets ADD COLUMN deleted_at TEXT;

                -- Create auth_state table for local session storage
                CREATE TABLE IF NOT EXISTS auth_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    user_id TEXT,
                    email TEXT,
                    access_token TEXT,
                    refresh_token TEXT,
                    expires_at TEXT,
                    last_sync_at TEXT
                );

                -- Update sync_queue to include user context and retry tracking
                ALTER TABLE sync_queue ADD COLUMN user_id TEXT;
                ALTER TABLE sync_queue ADD COLUMN attempts INTEGER DEFAULT 0;
                ALTER TABLE sync_queue ADD COLUMN last_attempt_at TEXT;
                ALTER TABLE sync_queue ADD COLUMN error_message TEXT;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add user_id and sync fields to savings tables",
            sql: r#"
                -- Add user_id to savings_goals (nullable for offline-first)
                ALTER TABLE savings_goals ADD COLUMN user_id TEXT;

                -- Add deleted_at for soft deletes (sync-friendly)
                ALTER TABLE savings_goals ADD COLUMN deleted_at TEXT;

                -- Add user_id to savings_contributions
                ALTER TABLE savings_contributions ADD COLUMN user_id TEXT;

                -- Add deleted_at to savings_contributions
                ALTER TABLE savings_contributions ADD COLUMN deleted_at TEXT;

                -- Add updated_at to savings_contributions for sync
                ALTER TABLE savings_contributions ADD COLUMN updated_at TEXT;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add notification preferences and scheduled notifications tables",
            sql: r#"
                -- Notification preferences (single row for user settings)
                -- Cron expressions encode both frequency and time
                CREATE TABLE IF NOT EXISTS notification_preferences (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    user_id TEXT,
                    notifications_enabled INTEGER DEFAULT 1,
                    -- Monthly check-in: cron for day-of-month + time (default: 2nd at 09:00)
                    monthly_checkin_enabled INTEGER DEFAULT 1,
                    monthly_checkin_cron TEXT DEFAULT '0 9 2 * *',
                    -- Progress updates: cron for frequency + time (default: weekly Monday at 10:00)
                    progress_updates_enabled INTEGER DEFAULT 1,
                    progress_updates_cron TEXT DEFAULT '0 10 * * 1',
                    -- Why reminders: cron for frequency + time (default: weekly Monday at 19:00)
                    why_reminders_enabled INTEGER DEFAULT 1,
                    why_reminders_cron TEXT DEFAULT '0 19 * * 1',
                    -- Quiet hours (start/end times as HH:MM)
                    quiet_hours_enabled INTEGER DEFAULT 0,
                    quiet_hours_start TEXT DEFAULT '22:00',
                    quiet_hours_end TEXT DEFAULT '08:00',
                    -- Timestamps
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                -- Scheduled notifications tracking
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
                    FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
                );

                -- Index for efficient queries
                CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled
                    ON scheduled_notifications(scheduled_at);
                CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_type
                    ON scheduled_notifications(notification_type);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add habit_tracking table and sync fields to habit_goals",
            sql: r#"
                -- Add user_id to habit_goals (nullable for offline-first)
                ALTER TABLE habit_goals ADD COLUMN user_id TEXT;

                -- Add deleted_at for soft deletes (sync-friendly)
                ALTER TABLE habit_goals ADD COLUMN deleted_at TEXT;

                -- Habit tracking (monthly snapshots of habit compliance)
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

                -- Index for efficient queries
                CREATE INDEX IF NOT EXISTS idx_habit_tracking_goal
                    ON habit_tracking(habit_goal_id);
                CREATE INDEX IF NOT EXISTS idx_habit_tracking_month
                    ON habit_tracking(month);
            "#,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:goaldy.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
