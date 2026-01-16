import Database from "@tauri-apps/plugin-sql";
import type { Budget, Category, Expense, ExpenseWithCategory, FeedbackNote } from "./types";
import { generateId, getCurrentMonth } from "./types";

// Lazy imports to avoid circular dependencies
let _getCurrentUserId: (() => Promise<string | null>) | null = null;
let _queueChange: ((tableName: string, recordId: string, operation: 'insert' | 'update' | 'delete', payload: object) => Promise<void>) | null = null;

async function getCurrentUserId(): Promise<string | null> {
  if (!_getCurrentUserId) {
    const auth = await import('./auth');
    _getCurrentUserId = auth.getCurrentUserId;
  }
  return _getCurrentUserId();
}

async function queueChange(tableName: string, recordId: string, operation: 'insert' | 'update' | 'delete', payload: object): Promise<void> {
  if (!_queueChange) {
    const sync = await import('./sync');
    _queueChange = sync.queueChange;
  }
  return _queueChange(tableName, recordId, operation, payload);
}

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:goaldy.db");
  }
  return db;
}

// Budget operations
export async function getCurrentBudget(): Promise<Budget | null> {
  const database = await getDatabase();
  const month = getCurrentMonth();
  const result = await database.select<Budget[]>(
    "SELECT * FROM budgets WHERE month = $1 AND deleted_at IS NULL",
    [month]
  );
  return result[0] || null;
}

export async function createOrUpdateBudget(totalAmount: number, spendingLimit?: number): Promise<Budget> {
  const database = await getDatabase();
  const month = getCurrentMonth();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  const existing = await getCurrentBudget();

  if (existing) {
    await database.execute(
      "UPDATE budgets SET total_amount = $1, spending_limit = $2, updated_at = $3, user_id = $4 WHERE id = $5",
      [totalAmount, spendingLimit ?? null, now, userId, existing.id]
    );
    const updated: Budget = {
      ...existing,
      total_amount: totalAmount,
      spending_limit: spendingLimit ?? null,
      updated_at: now,
      user_id: userId,
    };

    // Queue for sync
    if (userId) {
      await queueChange('budgets', existing.id, 'update', updated);
    }

    return updated;
  } else {
    const id = generateId();
    await database.execute(
      "INSERT INTO budgets (id, user_id, month, total_amount, spending_limit, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, userId, month, totalAmount, spendingLimit ?? null, now, now]
    );
    const budget: Budget = {
      id,
      user_id: userId,
      month,
      total_amount: totalAmount,
      spending_limit: spendingLimit ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    // Queue for sync
    if (userId) {
      await queueChange('budgets', id, 'insert', budget);
    }

    return budget;
  }
}

// Category operations
export async function getCategories(): Promise<Category[]> {
  const database = await getDatabase();
  return database.select<Category[]>(
    "SELECT * FROM categories WHERE is_hidden = 0 ORDER BY sort_order ASC"
  );
}

// Expense operations
export async function addExpense(amount: number, categoryId?: string, note?: string, date?: string): Promise<Expense> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const expenseDate = date || now.split('T')[0];
  const userId = await getCurrentUserId();

  await database.execute(
    "INSERT INTO expenses (id, user_id, amount, category_id, note, date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, userId, amount, categoryId ?? null, note ?? null, expenseDate, now, now]
  );

  const expense: Expense = {
    id,
    user_id: userId,
    amount,
    category_id: categoryId ?? null,
    note: note ?? null,
    date: expenseDate,
    created_at: now,
    updated_at: now,
    synced_at: null,
    deleted_at: null,
  };

  // Queue for sync
  if (userId) {
    await queueChange('expenses', id, 'insert', expense);
  }

  return expense;
}

export async function updateExpense(id: string, updates: Partial<Pick<Expense, 'amount' | 'category_id' | 'note' | 'date'>>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  const setClauses: string[] = ['updated_at = $1'];
  const params: (string | number | null)[] = [now];
  let paramIndex = 2;

  if (updates.amount !== undefined) {
    setClauses.push(`amount = $${paramIndex++}`);
    params.push(updates.amount);
  }
  if (updates.category_id !== undefined) {
    setClauses.push(`category_id = $${paramIndex++}`);
    params.push(updates.category_id);
  }
  if (updates.note !== undefined) {
    setClauses.push(`note = $${paramIndex++}`);
    params.push(updates.note);
  }
  if (updates.date !== undefined) {
    setClauses.push(`date = $${paramIndex++}`);
    params.push(updates.date);
  }

  params.push(id);

  await database.execute(
    `UPDATE expenses SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  // Queue for sync - fetch the updated expense
  if (userId) {
    const result = await database.select<Expense[]>(
      "SELECT * FROM expenses WHERE id = $1",
      [id]
    );
    if (result[0]) {
      await queueChange('expenses', id, 'update', result[0]);
    }
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  if (userId) {
    // Soft delete for authenticated users (for sync)
    await database.execute(
      "UPDATE expenses SET deleted_at = $1, updated_at = $1 WHERE id = $2",
      [now, id]
    );
    await queueChange('expenses', id, 'delete', { id, deleted_at: now, updated_at: now });
  } else {
    // Hard delete for offline-only users
    await database.execute("DELETE FROM expenses WHERE id = $1", [id]);
  }
}

export async function getExpensesForMonth(month?: string): Promise<ExpenseWithCategory[]> {
  const database = await getDatabase();
  const targetMonth = month || getCurrentMonth();

  return database.select<ExpenseWithCategory[]>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     WHERE strftime('%Y-%m', e.date) = $1 AND e.deleted_at IS NULL
     ORDER BY e.date DESC, e.created_at DESC`,
    [targetMonth]
  );
}

export async function getMonthlySpending(month?: string): Promise<number> {
  const database = await getDatabase();
  const targetMonth = month || getCurrentMonth();

  const result = await database.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = $1 AND deleted_at IS NULL`,
    [targetMonth]
  );

  return result[0]?.total || 0;
}

export async function getRecentExpenses(limit: number = 10): Promise<ExpenseWithCategory[]> {
  const database = await getDatabase();

  return database.select<ExpenseWithCategory[]>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.deleted_at IS NULL
     ORDER BY e.date DESC, e.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

// Feedback notes operations
export async function addFeedbackNote(content: string): Promise<FeedbackNote> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await database.execute(
    "INSERT INTO feedback_notes (id, content, created_at) VALUES ($1, $2, $3)",
    [id, content, now]
  );

  return { id, content, created_at: now };
}

export async function getFeedbackNotes(): Promise<FeedbackNote[]> {
  const database = await getDatabase();
  return database.select<FeedbackNote[]>(
    "SELECT * FROM feedback_notes ORDER BY created_at DESC"
  );
}

export async function deleteFeedbackNote(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM feedback_notes WHERE id = $1", [id]);
}
