# Storage & Sync Architecture

This document describes how data is stored and synchronized between local and remote databases in the Goaldy app.

## Overview

Goaldy uses a **local-first architecture** with optional cloud sync:

```
+------------------+         +------------------+         +------------------+
|                  |         |                  |         |                  |
|   React App      |<------->|   Local SQLite   |<------->|    Supabase      |
|   (UI State)     |         |   (Source of     |         |   (Remote        |
|                  |         |    Truth)        |         |    Backup)       |
+------------------+         +------------------+         +------------------+
        ^                           ^                            ^
        |                           |                            |
   User Actions              Read/Write                    Pull/Push
                             Operations                    Sync Queue
```

## Database Layers

### 1. Local Database (SQLite)

The app supports two SQLite implementations depending on the platform:

```
+----------------------------------------------------------+
|                     getDatabase()                         |
|                    (src/lib/database.ts)                  |
+----------------------------------------------------------+
           |                               |
           v                               v
+---------------------+         +------------------------+
|   Tauri SQLite      |         |   Browser sql.js       |
|   (@tauri-apps/     |         |   (WASM SQLite)        |
|    plugin-sql)      |         |                        |
|                     |         |   Persisted to         |
|   Native file:      |         |   IndexedDB            |
|   goaldy.db         |         |                        |
+---------------------+         +------------------------+
      Desktop                        Web Browser
```

### 2. Remote Database (Supabase)

PostgreSQL database hosted on Supabase with Row Level Security (RLS) policies.

## Data Flow Diagrams

### App Initialization

```
main.tsx
    |
    v
runMigrations()  -----> Creates/updates local schema
    |
    v
RouterProvider
    |
    +---> AuthProvider (AuthContext.tsx)
    |         |
    |         v
    |     initAuth() -----> Checks local auth_state table
    |         |              Returns { user, isAuthenticated }
    |         v
    +---> SyncProvider (SyncContext.tsx)
    |         |
    |         v
    +---> RootLayout (RootLayout.tsx)
              |
              +---> Wait for authLoading = false
              |
              +---> Is authenticated?
              |         |
              |    +----+----+
              |    |         |
              |   Yes        No
              |    |         |
              |    v         v
              | markInitialSyncDone()   Navigate to /login
              |    |
              |    v
              | fullSync()
              |    |
              |    +---> pullChanges() -----> Fetch from Supabase
              |    |         |                Merge into local DB
              |    |         v
              |    +---> pushChanges() -----> Send local changes
              |              |                to Supabase
              |              v
              | getCurrentBudget() -----> Read from local DB
              |    |
              |    v
              | setBudget(budget) -----> Update React state
              |    |
              |    v
              | Navigate to / or /setup
```

### Sync Flow

```
+-------------------------------------------------------------------+
|                         fullSync()                                 |
|                       (src/lib/sync.ts)                           |
+-------------------------------------------------------------------+
                    |                        |
                    v                        v
        +-------------------+      +-------------------+
        |   pullChanges()   |      |   pushChanges()   |
        +-------------------+      +-------------------+
                    |                        |
                    v                        v
    +---------------------------+  +---------------------------+
    | For each table:           |  | Get pending sync_queue    |
    |   - budgets               |  | items ordered by:         |
    |   - expenses              |  |   1. categories           |
    |   - savings_goals         |  |   2. savings_goals        |
    |   - savings_contributions |  |   3. habit_goals          |
    |   - habit_goals           |  |   4. budgets              |
    |   - habit_tracking        |  |   5. expenses             |
    |   - categories            |  |   6. savings_contributions|
    |   - feedback_notes        |  |   7. habit_tracking       |
    |   - notification_prefs    |  |   8. feedback_notes       |
    |   - scheduled_notifs      |  |   9. notification_prefs   |
    +---------------------------+  |  10. scheduled_notifs     |
                |                  +---------------------------+
                v                              |
    +---------------------------+              v
    | Query Supabase:           |  +---------------------------+
    | WHERE updated_at >        |  | For each queued item:     |
    |       last_sync_at        |  |   Upsert to Supabase      |
    +---------------------------+  |   Remove from sync_queue  |
                |                  +---------------------------+
                v
    +---------------------------+
    | For each remote record:   |
    |   merge*(db, remote, uid) |
    |                           |
    |   Last-write-wins:        |
    |   if remote.updated_at >  |
    |      local.updated_at     |
    |   then UPDATE local       |
    +---------------------------+
                |
                v
    +---------------------------+
    | Update last_sync_at in    |
    | auth_state table          |
    +---------------------------+
```

### Data Write Flow

```
User Action (e.g., add expense)
    |
    v
+---------------------------+
| database.ts function      |
| e.g., addExpense()        |
+---------------------------+
    |
    +---> INSERT into local SQLite
    |
    +---> Is user authenticated?
              |
         +----+----+
         |         |
        Yes        No
         |         |
         v         v
    queueChange()  (no sync)
         |
         v
    INSERT into sync_queue
         |
         v
    Is online?
         |
    +----+----+
    |         |
   Yes        No
    |         |
    v         v
pushChanges() (queued for later)
    |
    v
Upsert to Supabase
    |
    v
Remove from sync_queue
```

### Sync Completion & Data Refresh

```
+-------------------------------------------------------------------+
|                       SyncContext                                  |
+-------------------------------------------------------------------+
         |                                              ^
         | onSyncComplete() subscription                |
         v                                              |
+-------------------+                          +-------------------+
|   RootLayout      |                          |   sync()          |
|   subscribes to   |                          |   completes       |
|   sync events     |                          +-------------------+
+-------------------+                                  |
         |                                             |
         | When result.pulled > 0                      |
         v                                             |
+-------------------+                                  |
|   refetchBudget() |                                  |
|   - getCurrentBudget()                               |
|   - setBudget(newBudget)                             |
+-------------------+                                  |
         |                                             |
         v                                             |
+-------------------+         notifySyncComplete(result)
|   UI updates with |  <-------------------------------+
|   fresh data      |
+-------------------+
```

## Database Schema

### Tables (Local SQLite)

```sql
-- Core Data Tables (synced with Supabase)
categories          -- Expense categories (default + custom)
budgets             -- Monthly budgets (UNIQUE on month)
expenses            -- Individual expense records
savings_goals       -- Savings targets with why statements
savings_contributions -- Monthly savings check-ins
habit_goals         -- Spending habit rules
habit_tracking      -- Monthly habit compliance records
feedback_notes      -- User feedback/notes
notification_preferences  -- Notification settings (single row, id=1)
scheduled_notifications   -- Scheduled notification records

-- Local-Only Tables (not synced)
sync_queue          -- Pending changes to push to Supabase
auth_state          -- Local session storage (single row, id=1)
_migrations         -- Applied migration tracking
```

### Key Relationships

```
+----------------+       +------------------+
|   categories   |<------| expenses         |
|   (id)         |       | (category_id)    |
+----------------+       +------------------+
        ^
        |
+----------------+       +------------------+
|   habit_goals  |<------| habit_tracking   |
|   (id,         |       | (habit_goal_id)  |
|    category_id)|       +------------------+
+----------------+

+----------------+       +----------------------+
| savings_goals  |<------| savings_contributions|
| (id)           |       | (goal_id)            |
+----------------+       +----------------------+
```

## Sync Queue Structure

```
sync_queue
+------------+------------+------------+------------+
| table_name | record_id  | operation  | payload    |
+------------+------------+------------+------------+
| expenses   | exp_abc123 | insert     | {...}      |
| budgets    | bud_xyz789 | update     | {...}      |
| expenses   | exp_def456 | delete     | {deleted_at}|
+------------+------------+------------+------------+
```

Operations: `insert`, `update`, `delete`

Soft deletes: Records are marked with `deleted_at` timestamp rather than being removed, allowing sync to propagate deletions.

## Race Condition Prevention

### Problem (Before Fix)
Both `RootLayout` and `SyncContext` would trigger `fullSync()` on app startup:

```
RootLayout                    SyncContext
    |                             |
    v                             v
fullSync() -----------------> fullSync()  (RACE!)
    |                             |
    v                             v
Duplicate merges, inconsistent state
```

### Solution (After Fix)

```
RootLayout                    SyncContext
    |                             |
    v                             |
markInitialSyncDone()             |
    |                             |
    v                             v
fullSync()                    Check: initialSyncDoneRef.current?
    |                             |
    |                        +----+----+
    |                        |         |
    |                       true      false
    |                        |         |
    |                     (skip)    sync()
    v
getCurrentBudget()
    |
    v
Subscribe to onSyncComplete()
```

## Data Refresh After Sync

When sync pulls new data from remote, UI components need to refresh:

```typescript
// SyncContext exposes subscription mechanism
onSyncComplete: (listener: (result: SyncResult) => void) => () => void

// RootLayout subscribes to refresh budget
useEffect(() => {
  const unsubscribe = onSyncComplete((result: SyncResult) => {
    if (result.pulled > 0) {
      refetchBudget();  // Re-read from local DB
    }
  });
  return unsubscribe;
}, [onSyncComplete, refetchBudget]);
```

## Merge Strategy

The sync system uses **last-write-wins** conflict resolution:

```typescript
async function mergeBudget(db, remote, userId) {
  // Try to find local record by ID
  let local = await db.select('SELECT * FROM budgets WHERE id = ?', [remote.id]);

  // If not found by ID, try by month (UNIQUE constraint)
  if (!local) {
    local = await db.select('SELECT * FROM budgets WHERE month = ?', [remote.month]);
  }

  const remoteTime = new Date(remote.updated_at).getTime();
  const localTime = local ? new Date(local.updated_at).getTime() : 0;

  // Remote wins if newer
  if (!local || remoteTime > localTime) {
    if (local) {
      // Update existing record
      await db.execute('UPDATE budgets SET ... WHERE id = ?', [..., local.id]);
    } else {
      // Insert new record
      await db.execute('INSERT INTO budgets ...', [...]);
    }
    return true;  // Merged
  }

  return false;  // No change
}
```

## File Structure

```
src/
├── main.tsx                    # App entry, runs migrations
├── router.tsx                  # Route definitions
├── contexts/
│   ├── AuthContext.tsx         # Authentication state
│   └── SyncContext.tsx         # Sync state & operations
├── routes/
│   └── RootLayout.tsx          # App shell, initial sync, budget state
└── lib/
    ├── database.ts             # Local DB operations (CRUD)
    ├── browser-database.ts     # sql.js wrapper for browser
    ├── migrations.ts           # Schema migrations
    ├── sync.ts                 # Push/pull/merge logic
    ├── auth.ts                 # Authentication helpers
    ├── supabase.ts             # Supabase client
    └── types.ts                # TypeScript interfaces
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/sync.ts` | Core sync logic: `fullSync()`, `pullChanges()`, `pushChanges()`, merge functions |
| `src/lib/database.ts` | Local CRUD operations, queue changes for sync |
| `src/lib/migrations.ts` | Schema creation and migration tracking |
| `src/lib/browser-database.ts` | sql.js (WASM SQLite) wrapper for browser |
| `src/contexts/SyncContext.tsx` | React context for sync state, auto-sync triggers |
| `src/routes/RootLayout.tsx` | App initialization, budget state, sync subscriptions |
| `src/contexts/AuthContext.tsx` | Authentication state management |

## Environment Modes

| Mode | Database | Sync |
|------|----------|------|
| Tauri (Desktop) | Native SQLite file | Full sync with Supabase |
| Browser (Web) | sql.js + IndexedDB | Full sync with Supabase |
| Offline | Local only | Changes queued in sync_queue |
| No Supabase Config | Local only | No sync (works offline-only) |
