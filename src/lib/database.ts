import Database from "@tauri-apps/plugin-sql";
import type { Budget, Category, Expense, ExpenseWithCategory, FeedbackNote, SavingsContribution, SavingsGoal, SavingsGoalWithStats } from "./types";
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
