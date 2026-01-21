import { getBrowserDatabase } from "./browser-database";
import { isTauri } from "./platform";
import type { Budget, Category, Expense, ExpenseWithCategory, FeedbackNote, HabitGoal, HabitGoalWithStats, HabitTracking, SavingsContribution, SavingsGoal, SavingsGoalWithStats } from "./types";
import { generateId, getCurrentMonth } from "./types";

// Database interface that both Tauri SQLite and BrowserDatabase implement
interface DatabaseInterface {
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

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

let db: DatabaseInterface | null = null;
let dbInitPromise: Promise<DatabaseInterface> | null = null;

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
    "SELECT * FROM categories WHERE is_hidden = 0 AND deleted_at IS NULL ORDER BY sort_order ASC"
  );
}

export async function createCategory(
  name: string,
  icon: string,
  color: string
): Promise<Category> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  // Get max sort_order for custom categories
  const maxOrderResult = await database.select<{ max_order: number | null }[]>(
    "SELECT MAX(sort_order) as max_order FROM categories WHERE is_custom = 1"
  );
  const sortOrder = (maxOrderResult[0]?.max_order || 100) + 1;

  await database.execute(
    `INSERT INTO categories (id, user_id, name, icon, color, is_custom, is_hidden, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, 0, $6, $7, $8)`,
    [id, userId, name, icon, color, sortOrder, now, now]
  );

  const category: Category = {
    id,
    user_id: userId,
    name,
    icon,
    color,
    is_custom: 1,
    is_hidden: 0,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  // Queue for sync (only custom categories are synced)
  if (userId) {
    await queueChange('categories', id, 'insert', category);
  }

  return category;
}

export async function updateCategory(
  id: string,
  updates: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'is_hidden' | 'sort_order'>>
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  const setClauses: string[] = ['updated_at = $1'];
  const params: (string | number | null)[] = [now];
  let paramIndex = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }
  if (updates.icon !== undefined) {
    setClauses.push(`icon = $${paramIndex++}`);
    params.push(updates.icon);
  }
  if (updates.color !== undefined) {
    setClauses.push(`color = $${paramIndex++}`);
    params.push(updates.color);
  }
  if (updates.is_hidden !== undefined) {
    setClauses.push(`is_hidden = $${paramIndex++}`);
    params.push(updates.is_hidden);
  }
  if (updates.sort_order !== undefined) {
    setClauses.push(`sort_order = $${paramIndex++}`);
    params.push(updates.sort_order);
  }

  params.push(id);

  await database.execute(
    `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  // Queue for sync
  if (userId) {
    const result = await database.select<Category[]>(
      "SELECT * FROM categories WHERE id = $1",
      [id]
    );
    if (result[0] && result[0].is_custom === 1) {
      await queueChange('categories', id, 'update', result[0]);
    }
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  // Check if this is a custom category (only custom categories can be deleted)
  const result = await database.select<Category[]>(
    "SELECT * FROM categories WHERE id = $1",
    [id]
  );
  const category = result[0];
  if (!category || category.is_custom !== 1) {
    throw new Error('Cannot delete default categories');
  }

  if (userId) {
    // Soft delete for authenticated users (for sync)
    await database.execute(
      "UPDATE categories SET deleted_at = $1, updated_at = $1 WHERE id = $2",
      [now, id]
    );
    await queueChange('categories', id, 'delete', { id, deleted_at: now, updated_at: now });
  } else {
    // Hard delete for offline-only users
    await database.execute("DELETE FROM categories WHERE id = $1", [id]);
  }
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
  const userId = await getCurrentUserId();

  await database.execute(
    "INSERT INTO feedback_notes (id, user_id, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [id, userId, content, now, now]
  );

  const note: FeedbackNote = {
    id,
    user_id: userId,
    content,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  // Queue for sync
  if (userId) {
    await queueChange('feedback_notes', id, 'insert', note);
  }

  return note;
}

export async function getFeedbackNotes(): Promise<FeedbackNote[]> {
  const database = await getDatabase();
  return database.select<FeedbackNote[]>(
    "SELECT * FROM feedback_notes WHERE deleted_at IS NULL ORDER BY created_at DESC"
  );
}

export async function deleteFeedbackNote(id: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  if (userId) {
    // Soft delete for authenticated users (for sync)
    await database.execute(
      "UPDATE feedback_notes SET deleted_at = $1, updated_at = $1 WHERE id = $2",
      [now, id]
    );
    await queueChange('feedback_notes', id, 'delete', { id, deleted_at: now, updated_at: now });
  } else {
    // Hard delete for offline-only users
    await database.execute("DELETE FROM feedback_notes WHERE id = $1", [id]);
  }
}

// Savings Goals operations

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  const database = await getDatabase();
  return database.select<SavingsGoal[]>(
    "SELECT * FROM savings_goals WHERE deleted_at IS NULL ORDER BY created_at DESC"
  );
}

export async function getSavingsGoal(id: string): Promise<SavingsGoal | null> {
  const database = await getDatabase();
  const result = await database.select<SavingsGoal[]>(
    "SELECT * FROM savings_goals WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return result[0] || null;
}

export async function createSavingsGoal(
  name: string,
  targetAmount: number,
  targetDate: string,
  monthlyContribution: number,
  whyStatement?: string
): Promise<SavingsGoal> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  await database.execute(
    `INSERT INTO savings_goals (id, user_id, name, target_amount, target_date, monthly_contribution, why_statement, privacy_level, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'private', $8, $9)`,
    [id, userId, name, targetAmount, targetDate, monthlyContribution, whyStatement ?? null, now, now]
  );

  const goal: SavingsGoal = {
    id,
    user_id: userId,
    name,
    target_amount: targetAmount,
    target_date: targetDate,
    monthly_contribution: monthlyContribution,
    why_statement: whyStatement ?? null,
    privacy_level: 'private',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  // Queue for sync
  if (userId) {
    await queueChange('savings_goals', id, 'insert', goal);
  }

  return goal;
}

export async function updateSavingsGoal(
  id: string,
  updates: Partial<Pick<SavingsGoal, 'name' | 'target_amount' | 'target_date' | 'monthly_contribution' | 'why_statement' | 'privacy_level'>>
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  const setClauses: string[] = ['updated_at = $1'];
  const params: (string | number | null)[] = [now];
  let paramIndex = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }
  if (updates.target_amount !== undefined) {
    setClauses.push(`target_amount = $${paramIndex++}`);
    params.push(updates.target_amount);
  }
  if (updates.target_date !== undefined) {
    setClauses.push(`target_date = $${paramIndex++}`);
    params.push(updates.target_date);
  }
  if (updates.monthly_contribution !== undefined) {
    setClauses.push(`monthly_contribution = $${paramIndex++}`);
    params.push(updates.monthly_contribution);
  }
  if (updates.why_statement !== undefined) {
    setClauses.push(`why_statement = $${paramIndex++}`);
    params.push(updates.why_statement);
  }
  if (updates.privacy_level !== undefined) {
    setClauses.push(`privacy_level = $${paramIndex++}`);
    params.push(updates.privacy_level);
  }

  params.push(id);

  await database.execute(
    `UPDATE savings_goals SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  // Queue for sync
  if (userId) {
    const result = await database.select<SavingsGoal[]>(
      "SELECT * FROM savings_goals WHERE id = $1",
      [id]
    );
    if (result[0]) {
      await queueChange('savings_goals', id, 'update', result[0]);
    }
  }
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  if (userId) {
    // Soft delete for authenticated users (for sync)
    await database.execute(
      "UPDATE savings_goals SET deleted_at = $1, updated_at = $1 WHERE id = $2",
      [now, id]
    );
    await queueChange('savings_goals', id, 'delete', { id, deleted_at: now, updated_at: now });
  } else {
    // Hard delete for offline-only users
    await database.execute("DELETE FROM savings_goals WHERE id = $1", [id]);
  }

  // Also delete associated contributions
  if (userId) {
    await database.execute(
      "UPDATE savings_contributions SET deleted_at = $1, updated_at = $1 WHERE goal_id = $2",
      [now, id]
    );
  } else {
    await database.execute("DELETE FROM savings_contributions WHERE goal_id = $1", [id]);
  }
}

// Savings Contributions operations

export async function getContributionsForGoal(goalId: string): Promise<SavingsContribution[]> {
  const database = await getDatabase();
  return database.select<SavingsContribution[]>(
    "SELECT * FROM savings_contributions WHERE goal_id = $1 AND deleted_at IS NULL ORDER BY month DESC",
    [goalId]
  );
}

export async function getContributionForMonth(goalId: string, month: string): Promise<SavingsContribution | null> {
  const database = await getDatabase();
  const result = await database.select<SavingsContribution[]>(
    "SELECT * FROM savings_contributions WHERE goal_id = $1 AND month = $2 AND deleted_at IS NULL",
    [goalId, month]
  );
  return result[0] || null;
}

export async function addContribution(
  goalId: string,
  month: string,
  amount: number,
  isFullAmount: boolean
): Promise<SavingsContribution> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  // Check if contribution already exists for this month
  const existing = await getContributionForMonth(goalId, month);
  if (existing) {
    // Update existing contribution
    await database.execute(
      "UPDATE savings_contributions SET amount = $1, is_full_amount = $2, updated_at = $3 WHERE id = $4",
      [amount, isFullAmount ? 1 : 0, now, existing.id]
    );

    const updated: SavingsContribution = {
      ...existing,
      amount,
      is_full_amount: isFullAmount ? 1 : 0,
      updated_at: now,
    };

    if (userId) {
      await queueChange('savings_contributions', existing.id, 'update', updated);
    }

    return updated;
  }

  // Create new contribution
  await database.execute(
    `INSERT INTO savings_contributions (id, user_id, goal_id, month, amount, is_full_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, goalId, month, amount, isFullAmount ? 1 : 0, now, now]
  );

  const contribution: SavingsContribution = {
    id,
    user_id: userId,
    goal_id: goalId,
    month,
    amount,
    is_full_amount: isFullAmount ? 1 : 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (userId) {
    await queueChange('savings_contributions', id, 'insert', contribution);
  }

  return contribution;
}

export async function getTotalSavedForGoal(goalId: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(amount), 0) as total FROM savings_contributions WHERE goal_id = $1 AND deleted_at IS NULL",
    [goalId]
  );
  return result[0]?.total || 0;
}

export async function clearContributionsForGoal(goalId: string): Promise<void> {
  const database = await getDatabase();
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  if (userId) {
    // Soft delete for authenticated users
    await database.execute(
      "UPDATE savings_contributions SET deleted_at = $1, updated_at = $1 WHERE goal_id = $2 AND deleted_at IS NULL",
      [now, goalId]
    );
    // Queue deletions for sync
    const contributions = await database.select<SavingsContribution[]>(
      "SELECT * FROM savings_contributions WHERE goal_id = $1 AND deleted_at = $2",
      [goalId, now]
    );
    for (const contribution of contributions) {
      await queueChange('savings_contributions', contribution.id, 'delete', { id: contribution.id, deleted_at: now, updated_at: now });
    }
  } else {
    // Hard delete for offline-only users
    await database.execute(
      "DELETE FROM savings_contributions WHERE goal_id = $1",
      [goalId]
    );
  }
}

export async function getStreakForGoal(goalId: string): Promise<number> {
  const database = await getDatabase();
  const contributions = await database.select<SavingsContribution[]>(
    "SELECT * FROM savings_contributions WHERE goal_id = $1 AND deleted_at IS NULL ORDER BY month DESC",
    [goalId]
  );

  if (contributions.length === 0) return 0;

  let streak = 0;
  const now = new Date();
  // Get previous month (since we check in at start of month for previous month)
  let checkMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  for (const contribution of contributions) {
    const contribMonth = contribution.month; // "2026-01" format
    const expectedMonth = `${checkMonth.getFullYear()}-${String(checkMonth.getMonth() + 1).padStart(2, '0')}`;

    if (contribMonth === expectedMonth && contribution.amount > 0) {
      streak++;
      checkMonth = new Date(checkMonth.getFullYear(), checkMonth.getMonth() - 1, 1);
    } else if (contribMonth < expectedMonth) {
      // Gap in contributions, streak broken
      break;
    }
  }

  return streak;
}

export async function getSavingsGoalWithStats(goalId: string): Promise<SavingsGoalWithStats | null> {
  const goal = await getSavingsGoal(goalId);
  if (!goal) return null;

  const totalSaved = await getTotalSavedForGoal(goalId);
  const streak = await getStreakForGoal(goalId);

  const percentageComplete = goal.target_amount > 0
    ? (totalSaved / goal.target_amount) * 100
    : 0;

  // Calculate months remaining
  const now = new Date();
  const targetDate = new Date(goal.target_date);
  const monthsRemaining = Math.max(0,
    (targetDate.getFullYear() - now.getFullYear()) * 12 +
    (targetDate.getMonth() - now.getMonth())
  );

  // Calculate projected completion date first
  const amountRemaining = goal.target_amount - totalSaved;
  let projectedCompletionDate: string | null = null;
  let monthsToComplete = 0;

  if (totalSaved >= goal.target_amount) {
    // Already completed
    projectedCompletionDate = now.toISOString().split('T')[0];
  } else if (goal.monthly_contribution > 0) {
    // Use ceiling for display, but exact calculation for on-track check
    monthsToComplete = Math.ceil(amountRemaining / goal.monthly_contribution);
    const projected = new Date(now.getFullYear(), now.getMonth() + monthsToComplete, 1);
    projectedCompletionDate = projected.toISOString().split('T')[0];
  }

  // Calculate if on track - user is on track if projected completion is on or before target date
  let isOnTrack = false;
  if (totalSaved >= goal.target_amount) {
    // Already completed = on track
    isOnTrack = true;
  } else if (projectedCompletionDate) {
    // Compare projected completion to target date
    // On track if we'll finish by the target date
    const projected = new Date(projectedCompletionDate);
    isOnTrack = projected <= targetDate;
  }

  return {
    ...goal,
    total_saved: totalSaved,
    percentage_complete: percentageComplete,
    months_remaining: monthsRemaining,
    is_on_track: isOnTrack,
    projected_completion_date: projectedCompletionDate,
    current_streak: streak,
  };
}

export async function getAllSavingsGoalsWithStats(): Promise<SavingsGoalWithStats[]> {
  const goals = await getSavingsGoals();
  const goalsWithStats: SavingsGoalWithStats[] = [];

  for (const goal of goals) {
    const stats = await getSavingsGoalWithStats(goal.id);
    if (stats) {
      goalsWithStats.push(stats);
    }
  }

  return goalsWithStats;
}

// Check if any goals need monthly check-in (for the previous month)
export async function getGoalsNeedingCheckIn(): Promise<SavingsGoal[]> {
  const now = new Date();
  // Get previous month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  // Get all active goals
  const goals = await getSavingsGoals();

  // Filter to goals that don't have a contribution for the previous month
  const goalsNeedingCheckIn: SavingsGoal[] = [];
  for (const goal of goals) {
    const contribution = await getContributionForMonth(goal.id, prevMonthStr);
    if (!contribution) {
      goalsNeedingCheckIn.push(goal);
    }
  }

  return goalsNeedingCheckIn;
}

// ============================================
// Habit Goals operations
// ============================================

export async function getHabitGoals(): Promise<HabitGoal[]> {
  const database = await getDatabase();
  return database.select<HabitGoal[]>(
    "SELECT * FROM habit_goals WHERE deleted_at IS NULL ORDER BY created_at DESC"
  );
}

export async function getHabitGoal(id: string): Promise<HabitGoal | null> {
  const database = await getDatabase();
  const result = await database.select<HabitGoal[]>(
    "SELECT * FROM habit_goals WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return result[0] || null;
}

export async function createHabitGoal(
  name: string,
  categoryId: string,
  ruleType: 'max_amount' | 'max_percentage' | 'reduce_by',
  ruleValue: number,
  durationMonths?: number
): Promise<HabitGoal> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const startDate = now.split('T')[0];
  const userId = await getCurrentUserId();

  // Try with user_id column first, fall back to without if migration hasn't run
  try {
    await database.execute(
      `INSERT INTO habit_goals (id, user_id, name, category_id, rule_type, rule_value, duration_months, start_date, privacy_level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'private', $9, $10)`,
      [id, userId, name, categoryId, ruleType, ruleValue, durationMonths ?? null, startDate, now, now]
    );
  } catch (error) {
    // Fallback for older schema without user_id column
    console.warn('Falling back to legacy habit_goals schema:', error);
    await database.execute(
      `INSERT INTO habit_goals (id, name, category_id, rule_type, rule_value, duration_months, start_date, privacy_level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'private', $8, $9)`,
      [id, name, categoryId, ruleType, ruleValue, durationMonths ?? null, startDate, now, now]
    );
  }

  const goal: HabitGoal = {
    id,
    user_id: userId,
    name,
    category_id: categoryId,
    rule_type: ruleType,
    rule_value: ruleValue,
    duration_months: durationMonths ?? null,
    start_date: startDate,
    privacy_level: 'private',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  // Queue for sync
  if (userId) {
    await queueChange('habit_goals', id, 'insert', goal);
  }

  return goal;
}

export async function updateHabitGoal(
  id: string,
  updates: Partial<Pick<HabitGoal, 'name' | 'rule_value' | 'duration_months' | 'privacy_level'>>
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  const setClauses: string[] = ['updated_at = $1'];
  const params: (string | number | null)[] = [now];
  let paramIndex = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }
  if (updates.rule_value !== undefined) {
    setClauses.push(`rule_value = $${paramIndex++}`);
    params.push(updates.rule_value);
  }
  if (updates.duration_months !== undefined) {
    setClauses.push(`duration_months = $${paramIndex++}`);
    params.push(updates.duration_months);
  }
  if (updates.privacy_level !== undefined) {
    setClauses.push(`privacy_level = $${paramIndex++}`);
    params.push(updates.privacy_level);
  }

  params.push(id);

  await database.execute(
    `UPDATE habit_goals SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  // Queue for sync
  if (userId) {
    const result = await database.select<HabitGoal[]>(
      "SELECT * FROM habit_goals WHERE id = $1",
      [id]
    );
    if (result[0]) {
      await queueChange('habit_goals', id, 'update', result[0]);
    }
  }
}

export async function deleteHabitGoal(id: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  if (userId) {
    // Soft delete for authenticated users (for sync)
    await database.execute(
      "UPDATE habit_goals SET deleted_at = $1, updated_at = $1 WHERE id = $2",
      [now, id]
    );
    await queueChange('habit_goals', id, 'delete', { id, deleted_at: now, updated_at: now });
  } else {
    // Hard delete for offline-only users
    await database.execute("DELETE FROM habit_goals WHERE id = $1", [id]);
  }

  // Also delete associated tracking records
  if (userId) {
    await database.execute(
      "UPDATE habit_tracking SET deleted_at = $1, updated_at = $1 WHERE habit_goal_id = $2",
      [now, id]
    );
  } else {
    await database.execute("DELETE FROM habit_tracking WHERE habit_goal_id = $1", [id]);
  }
}

// ============================================
// Habit Tracking operations
// ============================================

export async function getHabitTrackingForGoal(habitGoalId: string): Promise<HabitTracking[]> {
  const database = await getDatabase();
  return database.select<HabitTracking[]>(
    "SELECT * FROM habit_tracking WHERE habit_goal_id = $1 AND deleted_at IS NULL ORDER BY month DESC",
    [habitGoalId]
  );
}

export async function getHabitTrackingForMonth(habitGoalId: string, month: string): Promise<HabitTracking | null> {
  const database = await getDatabase();
  const result = await database.select<HabitTracking[]>(
    "SELECT * FROM habit_tracking WHERE habit_goal_id = $1 AND month = $2 AND deleted_at IS NULL",
    [habitGoalId, month]
  );
  return result[0] || null;
}

export async function recordHabitTracking(
  habitGoalId: string,
  month: string,
  spentAmount: number,
  targetAmount: number,
  isCompliant: boolean
): Promise<HabitTracking> {
  const database = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const userId = await getCurrentUserId();

  // Check if tracking already exists for this month
  const existing = await getHabitTrackingForMonth(habitGoalId, month);
  if (existing) {
    // Update existing tracking
    await database.execute(
      "UPDATE habit_tracking SET spent_amount = $1, target_amount = $2, is_compliant = $3, updated_at = $4 WHERE id = $5",
      [spentAmount, targetAmount, isCompliant ? 1 : 0, now, existing.id]
    );

    const updated: HabitTracking = {
      ...existing,
      spent_amount: spentAmount,
      target_amount: targetAmount,
      is_compliant: isCompliant ? 1 : 0,
      updated_at: now,
    };

    if (userId) {
      await queueChange('habit_tracking', existing.id, 'update', updated);
    }

    return updated;
  }

  // Create new tracking record
  await database.execute(
    `INSERT INTO habit_tracking (id, user_id, habit_goal_id, month, spent_amount, target_amount, is_compliant, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, userId, habitGoalId, month, spentAmount, targetAmount, isCompliant ? 1 : 0, now, now]
  );

  const tracking: HabitTracking = {
    id,
    user_id: userId,
    habit_goal_id: habitGoalId,
    month,
    spent_amount: spentAmount,
    target_amount: targetAmount,
    is_compliant: isCompliant ? 1 : 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (userId) {
    await queueChange('habit_tracking', id, 'insert', tracking);
  }

  return tracking;
}

export async function getHabitStreakForGoal(habitGoalId: string): Promise<number> {
  const database = await getDatabase();
  const trackingRecords = await database.select<HabitTracking[]>(
    "SELECT * FROM habit_tracking WHERE habit_goal_id = $1 AND deleted_at IS NULL ORDER BY month DESC",
    [habitGoalId]
  );

  if (trackingRecords.length === 0) return 0;

  let streak = 0;
  const now = new Date();
  // Start from previous month (current month might still be in progress)
  let checkMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  for (const tracking of trackingRecords) {
    const trackingMonth = tracking.month; // "2026-01" format
    const expectedMonth = `${checkMonth.getFullYear()}-${String(checkMonth.getMonth() + 1).padStart(2, '0')}`;

    if (trackingMonth === expectedMonth && tracking.is_compliant === 1) {
      streak++;
      checkMonth = new Date(checkMonth.getFullYear(), checkMonth.getMonth() - 1, 1);
    } else if (trackingMonth < expectedMonth) {
      // Gap in tracking or non-compliant, streak broken
      break;
    }
  }

  return streak;
}

// Get spending for a specific category in a month
export async function getCategorySpendingForMonth(categoryId: string, month?: string): Promise<number> {
  const database = await getDatabase();
  const targetMonth = month || getCurrentMonth();

  const result = await database.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
     WHERE category_id = $1 AND strftime('%Y-%m', date) = $2 AND deleted_at IS NULL`,
    [categoryId, targetMonth]
  );

  return result[0]?.total || 0;
}

// Get spending for previous month for a category (for reduce_by calculations)
export async function getCategorySpendingForPreviousMonth(categoryId: string): Promise<number> {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  return getCategorySpendingForMonth(categoryId, prevMonthStr);
}

// Calculate target amount for a habit goal based on rule type
export async function calculateHabitTargetAmount(
  habitGoal: HabitGoal,
  month?: string
): Promise<number> {
  const targetMonth = month || getCurrentMonth();

  switch (habitGoal.rule_type) {
    case 'max_amount':
      // Simple max amount limit
      return habitGoal.rule_value;

    case 'max_percentage': {
      // Percentage of total monthly spending
      const totalSpending = await getMonthlySpending(targetMonth);
      // If no spending yet, use budget as reference
      if (totalSpending === 0) {
        const budget = await getCurrentBudget();
        if (budget) {
          return (habitGoal.rule_value / 100) * budget.total_amount;
        }
      }
      return (habitGoal.rule_value / 100) * totalSpending;
    }

    case 'reduce_by': {
      // Reduce spending by X% compared to last month
      const prevMonthSpending = await getCategorySpendingForPreviousMonth(habitGoal.category_id);
      if (prevMonthSpending === 0) {
        // No previous month data, use a reasonable default
        return habitGoal.rule_value; // Fall back to treating it as max_amount
      }
      return prevMonthSpending * (1 - habitGoal.rule_value / 100);
    }

    default:
      return habitGoal.rule_value;
  }
}

// Get habit goal with calculated stats
export async function getHabitGoalWithStats(habitGoalId: string): Promise<HabitGoalWithStats | null> {
  const goal = await getHabitGoal(habitGoalId);
  if (!goal) return null;

  const database = await getDatabase();
  const currentMonth = getCurrentMonth();

  // Get category info
  const categories = await database.select<Category[]>(
    "SELECT * FROM categories WHERE id = $1",
    [goal.category_id]
  );
  const category = categories[0];

  // Get current month spending for this category
  const currentMonthSpent = await getCategorySpendingForMonth(goal.category_id, currentMonth);

  // Calculate target amount based on rule type
  const currentMonthTarget = await calculateHabitTargetAmount(goal, currentMonth);

  // Calculate percentage used
  const percentageUsed = currentMonthTarget > 0
    ? (currentMonthSpent / currentMonthTarget) * 100
    : 0;

  // Determine compliance and status
  const isCompliant = currentMonthSpent <= currentMonthTarget;
  let status: 'safe' | 'warning' | 'exceeded';
  if (percentageUsed >= 100) {
    status = 'exceeded';
  } else if (percentageUsed >= 80) {
    status = 'warning';
  } else {
    status = 'safe';
  }

  // Get streak
  const streak = await getHabitStreakForGoal(habitGoalId);

  return {
    ...goal,
    category_name: category?.name || null,
    category_icon: category?.icon || null,
    category_color: category?.color || null,
    current_month_spent: currentMonthSpent,
    current_month_target: currentMonthTarget,
    percentage_used: percentageUsed,
    is_compliant: isCompliant,
    current_streak: streak,
    status,
  };
}

// Get all habit goals with stats
export async function getAllHabitGoalsWithStats(): Promise<HabitGoalWithStats[]> {
  const goals = await getHabitGoals();
  const goalsWithStats: HabitGoalWithStats[] = [];

  for (const goal of goals) {
    const stats = await getHabitGoalWithStats(goal.id);
    if (stats) {
      goalsWithStats.push(stats);
    }
  }

  return goalsWithStats;
}

// Get habit goals that are approaching or exceeding limits (for alerts)
export async function getHabitGoalsNeedingAlert(): Promise<HabitGoalWithStats[]> {
  const goalsWithStats = await getAllHabitGoalsWithStats();

  // Return goals that are at warning (80%+) or exceeded status
  return goalsWithStats.filter(goal => goal.status === 'warning' || goal.status === 'exceeded');
}

// Finalize month tracking for all habit goals (called at end of month or for past months)
export async function finalizeHabitTrackingForMonth(month: string): Promise<void> {
  const goals = await getHabitGoals();

  for (const goal of goals) {
    const spent = await getCategorySpendingForMonth(goal.category_id, month);
    const target = await calculateHabitTargetAmount(goal, month);
    const isCompliant = spent <= target;

    await recordHabitTracking(goal.id, month, spent, target, isCompliant);
  }
}
