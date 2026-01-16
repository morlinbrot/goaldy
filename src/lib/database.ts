import Database from "@tauri-apps/plugin-sql";
import type { Budget, Category, Expense, ExpenseWithCategory, FeedbackNote } from "./types";
import { generateId, getCurrentMonth } from "./types";

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
    "SELECT * FROM budgets WHERE month = $1",
    [month]
  );
  return result[0] || null;
}

export async function createOrUpdateBudget(totalAmount: number, spendingLimit?: number): Promise<Budget> {
  const database = await getDatabase();
  const month = getCurrentMonth();
  const now = new Date().toISOString();

  const existing = await getCurrentBudget();

  if (existing) {
    await database.execute(
      "UPDATE budgets SET total_amount = $1, spending_limit = $2, updated_at = $3 WHERE id = $4",
      [totalAmount, spendingLimit ?? null, now, existing.id]
    );
    return { ...existing, total_amount: totalAmount, spending_limit: spendingLimit ?? null, updated_at: now };
  } else {
    const id = generateId();
    await database.execute(
      "INSERT INTO budgets (id, month, total_amount, spending_limit, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, month, totalAmount, spendingLimit ?? null, now, now]
    );
    return { id, month, total_amount: totalAmount, spending_limit: spendingLimit ?? null, created_at: now, updated_at: now };
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

  await database.execute(
    "INSERT INTO expenses (id, amount, category_id, note, date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, amount, categoryId ?? null, note ?? null, expenseDate, now, now]
  );

  return {
    id,
    amount,
    category_id: categoryId ?? null,
    note: note ?? null,
    date: expenseDate,
    created_at: now,
    updated_at: now,
    synced_at: null,
  };
}

export async function updateExpense(id: string, updates: Partial<Pick<Expense, 'amount' | 'category_id' | 'note' | 'date'>>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

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
}

export async function deleteExpense(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM expenses WHERE id = $1", [id]);
}

export async function getExpensesForMonth(month?: string): Promise<ExpenseWithCategory[]> {
  const database = await getDatabase();
  const targetMonth = month || getCurrentMonth();

  return database.select<ExpenseWithCategory[]>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     WHERE strftime('%Y-%m', e.date) = $1
     ORDER BY e.date DESC, e.created_at DESC`,
    [targetMonth]
  );
}

export async function getMonthlySpending(month?: string): Promise<number> {
  const database = await getDatabase();
  const targetMonth = month || getCurrentMonth();

  const result = await database.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = $1`,
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
