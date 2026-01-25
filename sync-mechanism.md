# Sync Mechanism Implementation Plan

## Overview

This document outlines the architecture and implementation plan for a robust offline-first synchronization system for Goaldy. The system ensures:

- Local SQLite database is always the source of truth for reads
- All writes go to local first, then queue for remote sync
- Bidirectional sync with Supabase PostgreSQL
- No data loss through conflict resolution and retry mechanisms
- Seamless React integration via observable patterns

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React UI Layer                           │
│              useExpenses(), useBudgets(), etc.                  │
│         (hooks that subscribe to repository data changes)       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                      Repository Layer                           │
│   ExpensesRepository, BudgetsRepository, SavingsRepository...   │
│                                                                 │
│   • Exposes data via subscription callbacks                     │
│   • All reads come from LocalDataSource (source of truth)       │
│   • Writes go to LocalDataSource + enqueue to SyncQueue         │
│   • Contains entity-specific merge logic                        │
└──────────┬────────────────────┬─────────────────────────────────┘
           │                    │
           │         ┌──────────▼──────────┐
           │         │    SyncService      │
           │         │                     │
           │         │ • Online detection  │
           │         │ • Push/pull orchestr│
           │         │ • Debounced push    │
           │         │ • Periodic sync     │
           │         │ • Retry + backoff   │
           │         │ • Dead letter queue │
           │         └──────────┬──────────┘
           │                    │
┌──────────▼──────────┐        │        ┌──────────────────┐
│  LocalDataSource    │        │        │ RemoteDataSource │
│     (SQLite)        │        │        │   (Supabase)     │
│                     │◄───────┴───────►│                  │
│ • CRUD operations   │                 │ • CRUD operations│
│ • Query methods     │                 │ • Batch fetch    │
│ • Transaction supp. │                 │ • Auth handling  │
└─────────────────────┘                 └──────────────────┘
```

## File Structure

```
src/
├── sync/
│   ├── index.ts                         # Public API exports
│   ├── types.ts                         # Shared sync types
│   │
│   ├── services/
│   │   ├── SyncService.ts               # Main orchestrator
│   │   └── SyncQueue.ts                 # Queue operations
│   │
│   ├── datasources/
│   │   ├── types.ts                     # DataSource interfaces
│   │   ├── LocalDataSource.ts           # SQLite implementation
│   │   └── RemoteDataSource.ts          # Supabase implementation
│   │
│   └── repositories/
│       ├── BaseRepository.ts            # Abstract base class
│       ├── ExpensesRepository.ts
│       ├── BudgetsRepository.ts
│       ├── CategoriesRepository.ts
│       ├── SavingsGoalsRepository.ts
│       ├── SavingsContributionsRepository.ts
│       ├── HabitGoalsRepository.ts
│       ├── HabitTrackingRepository.ts
│       ├── NotificationPreferencesRepository.ts
│       ├── ScheduledNotificationsRepository.ts
│       └── FeedbackNotesRepository.ts
│
├── contexts/
│   ├── SyncContext.tsx                  # Updated sync provider
│   └── RepositoryContext.tsx            # Repository provider (new)
│
└── hooks/
    ├── useRepository.ts                 # Generic repository hook
    ├── useExpenses.ts                   # Expense-specific hook
    ├── useBudgets.ts                    # Budget-specific hook
    └── ...                              # Other entity hooks
```

## Core Types

### sync/types.ts

```typescript
// Sync operation types
export type SyncOperation = 'create' | 'update' | 'delete';

// Sync status for UI
export type SyncStatus = 'idle' | 'syncing' | 'error';

// Individual queue item (matches DB schema)
export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;  // JSON stringified
  user_id: string;
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
}

// Dead letter queue item (failed after max retries)
export interface DeadLetterItem extends SyncQueueItem {
  failed_at: string;
  final_error: string;
}

// Sync result for a single operation
export interface SyncOperationResult {
  success: boolean;
  error?: string;
}

// Overall sync result
export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
  deadLettered: number;
}

// Merge strategy options
export type MergeStrategy = 'last-write-wins' | 'local-wins' | 'remote-wins';

// Base entity interface (all syncable entities must have these)
export interface SyncableEntity {
  id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Listener types for observable pattern
export type DataListener<T> = (data: T[]) => void;
export type SyncStatusListener = (status: SyncStatus, error?: string) => void;
```

## Implementation Details

### 1. SyncQueue (sync/services/SyncQueue.ts)

Manages the queue of pending sync operations.

**Responsibilities:**
- Enqueue new operations
- Dequeue items for processing (respecting FK order)
- Track attempts and errors
- Move items to dead letter queue after max retries

**Key Methods:**
```typescript
class SyncQueue {
  // Add operation to queue
  async enqueue(tableName: string, recordId: string, operation: SyncOperation, payload: object): Promise<void>

  // Get next batch of items to sync (ordered by FK dependencies)
  async getPendingItems(limit?: number): Promise<SyncQueueItem[]>

  // Mark item as successfully synced (remove from queue)
  async markComplete(id: string): Promise<void>

  // Increment retry count and record error
  async markFailed(id: string, error: string): Promise<void>

  // Move to dead letter queue after max retries
  async moveToDeadLetter(item: SyncQueueItem, finalError: string): Promise<void>

  // Get dead letter items for display/retry
  async getDeadLetterItems(): Promise<DeadLetterItem[]>

  // Retry a dead letter item
  async retryDeadLetter(id: string): Promise<void>

  // Count pending items
  async getPendingCount(): Promise<number>
}
```

**FK Dependency Order:**
1. categories
2. savings_goals
3. habit_goals
4. budgets
5. expenses
6. savings_contributions
7. habit_tracking
8. feedback_notes
9. notification_preferences
10. scheduled_notifications

### 2. SyncService (sync/services/SyncService.ts)

Central orchestrator for all sync operations.

**Responsibilities:**
- Track online/offline status
- Coordinate push and pull across all repositories
- Manage debounced push scheduling
- Run periodic sync
- Handle retry with exponential backoff
- Emit sync status changes

**Configuration:**
```typescript
const SYNC_CONFIG = {
  DEBOUNCE_MS: 2000,           // Wait 2s after last change before pushing
  PERIODIC_SYNC_MS: 60000,     // Full sync every 60 seconds
  MAX_RETRY_ATTEMPTS: 3,       // Max retries before dead letter
  BASE_RETRY_DELAY_MS: 1000,   // Initial retry delay
  MAX_RETRY_DELAY_MS: 30000,   // Max retry delay (30s)
};
```

**Key Methods:**
```typescript
class SyncService {
  // Lifecycle
  initialize(): void                    // Start listeners, periodic sync
  destroy(): void                       // Cleanup

  // Status
  get isOnline(): boolean
  get isSyncing(): boolean
  get lastSyncAt(): string | null

  // Sync triggers
  schedulePush(): void                  // Debounced push (called by repositories)
  async fullSync(): Promise<SyncResult> // Pull then push
  async pushPendingChanges(): Promise<SyncResult>
  async pullChanges(): Promise<SyncResult>

  // Subscriptions
  onStatusChange(listener: SyncStatusListener): () => void

  // Repository registration
  registerRepository(repo: SyncableRepository): void
}
```

**Exponential Backoff:**
```typescript
function getRetryDelay(attempt: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}
// Attempt 0: 1000ms
// Attempt 1: 2000ms
// Attempt 2: 4000ms
// Attempt 3: -> Dead letter queue
```

### 3. LocalDataSource (sync/datasources/LocalDataSource.ts)

Generic interface and SQLite implementation for local data access.

**Interface:**
```typescript
interface LocalDataSource<T extends SyncableEntity> {
  // CRUD
  getById(id: string): Promise<T | null>
  getAll(includeDeleted?: boolean): Promise<T[]>
  insert(item: T): Promise<void>
  update(id: string, item: Partial<T>): Promise<void>
  delete(id: string, soft?: boolean): Promise<void>
  upsert(item: T): Promise<void>

  // Queries (entity-specific methods added in subclasses)
  query(filter: Partial<T>): Promise<T[]>
}
```

**Implementation Notes:**
- Wraps the existing `getDatabase()` from `src/lib/database.ts`
- Each entity gets its own LocalDataSource instance with table name
- Handles soft deletes (set `deleted_at`) for authenticated users

### 4. RemoteDataSource (sync/datasources/RemoteDataSource.ts)

Generic interface and Supabase implementation for remote data access.

**Interface:**
```typescript
interface RemoteDataSource<T extends SyncableEntity> {
  // CRUD
  getById(id: string): Promise<T | null>
  getAll(since?: string): Promise<T[]>  // Fetch changed since timestamp
  upsert(item: T): Promise<void>
  delete(id: string): Promise<void>     // Soft delete (update deleted_at)

  // Batch operations
  upsertBatch(items: T[]): Promise<void>
}
```

**Implementation Notes:**
- Uses `getSupabase()` from `src/lib/supabase.ts`
- Handles auth session setup before each request
- Returns null/empty when Supabase not configured (graceful degradation)

### 5. BaseRepository (sync/repositories/BaseRepository.ts)

Abstract base class that all entity repositories extend.

**Responsibilities:**
- Coordinate between LocalDataSource and RemoteDataSource
- Manage subscriber notifications
- Implement default merge logic (last-write-wins)
- Queue changes to SyncQueue

**Key Structure:**
```typescript
abstract class BaseRepository<T extends SyncableEntity> {
  protected localDataSource: LocalDataSource<T>;
  protected remoteDataSource: RemoteDataSource<T>;
  protected syncQueue: SyncQueue;
  protected syncService: SyncService;

  protected listeners: Set<DataListener<T>> = new Set();
  protected mergeStrategy: MergeStrategy = 'last-write-wins';

  // Abstract (entity-specific)
  abstract readonly tableName: string;

  // Subscription (React integration)
  subscribe(listener: DataListener<T>): () => void
  protected notifyListeners(): Promise<void>

  // Read operations (always from local)
  async getAll(): Promise<T[]>
  async getById(id: string): Promise<T | null>

  // Write operations (local + queue)
  async create(item: Omit<T, 'id' | 'created_at' | 'updated_at'>): Promise<T>
  async update(id: string, changes: Partial<T>): Promise<T>
  async delete(id: string): Promise<void>

  // Sync operations (called by SyncService)
  async pull(since?: string): Promise<number>
  async push(item: SyncQueueItem): Promise<void>

  // Merge logic
  protected shouldAcceptRemote(remote: T, local: T | null): boolean
  protected async merge(remote: T): Promise<boolean>
}
```

### 6. Entity Repositories

Each repository extends BaseRepository with entity-specific logic.

**Example: ExpensesRepository**
```typescript
class ExpensesRepository extends BaseRepository<Expense> {
  readonly tableName = 'expenses';

  // Entity-specific queries
  async getByDateRange(start: string, end: string): Promise<Expense[]>
  async getByCategory(categoryId: string): Promise<Expense[]>
  async getByMonth(month: string): Promise<Expense[]>
}
```

**Example: BudgetsRepository (with custom merge)**
```typescript
class BudgetsRepository extends BaseRepository<Budget> {
  readonly tableName = 'budgets';

  // Entity-specific queries
  async getByMonth(month: string): Promise<Budget | null>
  async getCurrentBudget(): Promise<Budget | null>

  // Override merge for UNIQUE month constraint
  protected async merge(remote: Budget): Promise<boolean> {
    const localById = await this.localDataSource.getById(remote.id);

    if (!localById) {
      // Check for existing budget with same month but different ID
      const localByMonth = await this.getByMonth(remote.month);
      if (localByMonth && this.shouldAcceptRemote(remote, localByMonth)) {
        // Update existing local record with remote data and ID
        await this.localDataSource.delete(localByMonth.id, false);
        await this.localDataSource.insert(remote);
        return true;
      }
    }

    return super.merge(remote);
  }
}
```

### 7. React Integration

#### RepositoryContext (contexts/RepositoryContext.tsx)

Provides singleton repository instances to the app.

```typescript
interface RepositoryContextValue {
  expenses: ExpensesRepository;
  budgets: BudgetsRepository;
  categories: CategoriesRepository;
  savingsGoals: SavingsGoalsRepository;
  savingsContributions: SavingsContributionsRepository;
  habitGoals: HabitGoalsRepository;
  habitTracking: HabitTrackingRepository;
  notificationPreferences: NotificationPreferencesRepository;
  scheduledNotifications: ScheduledNotificationsRepository;
  feedbackNotes: FeedbackNotesRepository;
  syncService: SyncService;
}

function RepositoryProvider({ children }: { children: ReactNode }) {
  // Create singletons once
  const [repos] = useState(() => createRepositories());

  // Initialize sync service
  useEffect(() => {
    repos.syncService.initialize();
    return () => repos.syncService.destroy();
  }, []);

  return (
    <RepositoryContext.Provider value={repos}>
      {children}
    </RepositoryContext.Provider>
  );
}
```

#### Updated SyncContext (contexts/SyncContext.tsx)

Simplified to use SyncService from RepositoryContext.

```typescript
function SyncProvider({ children }: { children: ReactNode }) {
  const { syncService } = useRepositories();
  const { isAuthenticated } = useAuth();

  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return syncService.onStatusChange((newStatus, err) => {
      setStatus(newStatus);
      setError(err || null);
    });
  }, [syncService]);

  // Trigger sync on auth change
  useEffect(() => {
    if (isAuthenticated) {
      syncService.fullSync();
    }
  }, [isAuthenticated]);

  const value = {
    status,
    error,
    isOnline: syncService.isOnline,
    isSyncing: status === 'syncing',
    lastSyncAt: syncService.lastSyncAt,
    sync: () => syncService.fullSync(),
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}
```

#### Entity Hooks (hooks/useExpenses.ts, etc.)

```typescript
function useExpenses() {
  const { expenses: repo } = useRepositories();
  const [data, setData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = repo.subscribe((expenses) => {
      setData(expenses);
      setLoading(false);
    });
    return unsubscribe;
  }, [repo]);

  const addExpense = useCallback(async (expense: NewExpense) => {
    return repo.create(expense);
  }, [repo]);

  const updateExpense = useCallback(async (id: string, changes: Partial<Expense>) => {
    return repo.update(id, changes);
  }, [repo]);

  const deleteExpense = useCallback(async (id: string) => {
    return repo.delete(id);
  }, [repo]);

  return {
    expenses: data,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}
```

## Sync Flow Diagrams

### Write Flow (User adds expense)

```
1. User taps "Add Expense"
           │
           ▼
2. useExpenses().addExpense(data)
           │
           ▼
3. ExpensesRepository.create(data)
           │
           ├──► LocalDataSource.insert(expense)
           │              │
           │              ▼
           │    SQLite INSERT executed
           │
           ├──► SyncQueue.enqueue('expenses', 'create', expense)
           │              │
           │              ▼
           │    sync_queue INSERT executed
           │
           ├──► notifyListeners()
           │              │
           │              ▼
           │    React components re-render with new data
           │
           └──► SyncService.schedulePush()
                          │
                          ▼
               [2 second debounce timer starts]
                          │
                          ▼ (after 2s or more changes)
               SyncService.pushPendingChanges()
                          │
                          ▼
               For each queued item:
                 └─► Repository.push(item)
                       └─► RemoteDataSource.upsert(expense)
                             └─► Supabase INSERT/UPDATE
```

### Pull Flow (Periodic sync or app start)

```
1. SyncService.pullChanges() triggered
           │
           ▼
2. For each repository (in FK order):
           │
           ├──► ExpensesRepository.pull(lastSyncAt)
           │              │
           │              ▼
           │    RemoteDataSource.getAll(since: lastSyncAt)
           │              │
           │              ▼
           │    Supabase SELECT WHERE updated_at > lastSyncAt
           │              │
           │              ▼
           │    For each remote item:
           │      └─► repository.merge(remoteItem)
           │                │
           │                ├─► Compare updated_at (last-write-wins)
           │                │
           │                └─► If remote wins:
           │                      LocalDataSource.upsert(remoteItem)
           │              │
           │              ▼
           │    notifyListeners()
           │              │
           │              ▼
           │    React components re-render with merged data
           │
           ▼
3. Update lastSyncAt timestamp
```

### Retry Flow (Failed push)

```
1. SyncService.pushPendingChanges()
           │
           ▼
2. Repository.push(item) throws error
           │
           ▼
3. SyncQueue.markFailed(item.id, error)
           │
           ├──► attempts += 1
           │
           └──► If attempts >= 3:
                  │
                  ▼
                SyncQueue.moveToDeadLetter(item, error)
                  │
                  ▼
                Item removed from sync_queue
                Item added to dead_letter_queue
                  │
                  ▼
                SyncService emits status: 'error'
                  │
                  ▼
                UI shows error notification
```

## Database Schema Changes

### New table: dead_letter_queue

```sql
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  failed_at TEXT NOT NULL,
  final_error TEXT NOT NULL
);
```

### Existing sync_queue (no changes needed)

The current schema already supports the new system:
- `id`, `table_name`, `record_id`, `operation`, `payload`
- `user_id`, `created_at`, `attempts`
- `last_attempt_at`, `error_message`

## Migration Path

### Phase 1: Create new sync infrastructure

1. Create `src/sync/types.ts`
2. Create `src/sync/services/SyncQueue.ts` (new implementation)
3. Create `src/sync/services/SyncService.ts`
4. Create `src/sync/datasources/types.ts`
5. Create `src/sync/datasources/LocalDataSource.ts`
6. Create `src/sync/datasources/RemoteDataSource.ts`
7. Create `src/sync/repositories/BaseRepository.ts`
8. Add dead_letter_queue table migration

### Phase 2: Implement entity repositories

9. Create `ExpensesRepository.ts`
10. Create `BudgetsRepository.ts`
11. Create `CategoriesRepository.ts`
12. Create `SavingsGoalsRepository.ts`
13. Create `SavingsContributionsRepository.ts`
14. Create `HabitGoalsRepository.ts`
15. Create `HabitTrackingRepository.ts`
16. Create `NotificationPreferencesRepository.ts`
17. Create `ScheduledNotificationsRepository.ts`
18. Create `FeedbackNotesRepository.ts`

### Phase 3: React integration

19. Create `src/contexts/RepositoryContext.tsx`
20. Update `src/contexts/SyncContext.tsx`
21. Create entity hooks (`useExpenses.ts`, etc.)
22. Create `src/sync/index.ts` (public exports)

### Phase 4: Migrate existing code

23. Update components to use new hooks instead of direct database calls
24. Remove deprecated sync code from `src/lib/sync.ts`
25. Remove deprecated `src/lib/sync/` folder
26. Update `src/lib/database.ts` to remove sync-related code (keep pure CRUD)

## Testing Strategy

### Unit Tests

- SyncQueue: enqueue, dequeue, retry, dead letter
- BaseRepository: CRUD, merge logic, notifications
- SyncService: debounce, periodic sync, online/offline

### Integration Tests

- Full sync flow: create local → push → verify remote
- Pull flow: create remote → pull → verify local
- Conflict resolution: modify both → sync → verify winner
- Offline queue: create offline → go online → verify sync
- Dead letter: fail 3 times → verify in dead letter queue

### Manual Testing Checklist

- [ ] Add expense offline → comes online → syncs
- [ ] Modify same item on two devices → both sync → last write wins
- [ ] Kill app mid-sync → reopen → resumes correctly
- [ ] View dead letter items → retry → succeeds
- [ ] Rapid changes → debounce works → single push

## Error Handling

### Network Errors
- Increment retry count
- Schedule retry with exponential backoff
- After 3 failures → dead letter queue

### Auth Errors (401/403)
- Do not retry (would fail again)
- Immediately dead letter
- Prompt user to re-authenticate

### Conflict Errors (409)
- Pull latest remote data
- Re-attempt merge
- Retry push

### Validation Errors (400)
- Do not retry (data is invalid)
- Dead letter with error details
- Log for debugging

## Configuration Summary

| Setting | Value | Rationale |
|---------|-------|-----------|
| Push debounce | 2 seconds | Balance between responsiveness and efficiency |
| Periodic sync | 60 seconds | Regular sync without excessive polling |
| Max retries | 3 | Reasonable attempts before giving up |
| Base retry delay | 1 second | Quick first retry |
| Max retry delay | 30 seconds | Cap backoff at reasonable limit |
| Merge strategy | Last-write-wins | Simple, predictable, works for personal app |

## Open Questions / Future Enhancements

1. **Real-time sync**: Consider Supabase Realtime for instant push notifications from server
2. **Partial sync**: Allow syncing only specific entities (e.g., just expenses)
3. **Sync progress**: Show detailed progress during large syncs
4. **Conflict UI**: Optional manual conflict resolution for important data
5. **Compression**: Compress large payloads before storing in queue
6. **Batch operations**: Bulk import/export with optimized sync
