// Database types matching SQLite schema

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  is_custom: number;
  is_hidden: number;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Budget {
  id: string;
  user_id: string | null;
  month: string; // "2026-01"
  total_amount: number;
  spending_limit: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Expense {
  id: string;
  user_id: string | null;
  amount: number;
  category_id: string | null;
  note: string | null;
  date: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  deleted_at: string | null;
}

export interface ExpenseWithCategory extends Expense {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export interface SavingsGoal {
  id: string;
  user_id: string | null;
  name: string;
  target_amount: number;
  target_date: string;
  monthly_contribution: number;
  why_statement: string | null;
  privacy_level: 'private' | 'progress_only' | 'full';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SavingsContribution {
  id: string;
  user_id: string | null;
  goal_id: string;
  month: string;
  amount: number;
  is_full_amount: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Extended type with calculated stats for the UI
export interface SavingsGoalWithStats extends SavingsGoal {
  total_saved: number;
  percentage_complete: number;
  months_remaining: number;
  is_on_track: boolean;
  projected_completion_date: string | null;
  current_streak: number;
}

export interface HabitGoal {
  id: string;
  user_id: string | null;
  name: string;
  category_id: string;
  rule_type: 'max_amount' | 'max_percentage' | 'reduce_by';
  rule_value: number;
  duration_months: number | null;
  start_date: string;
  privacy_level: 'private' | 'progress_only' | 'full';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface HabitTracking {
  id: string;
  user_id: string | null;
  habit_goal_id: string;
  month: string; // "2026-01"
  spent_amount: number;
  target_amount: number;
  is_compliant: number | null; // 1 = met target, 0 = exceeded
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Extended type with calculated stats for the UI
export interface HabitGoalWithStats extends HabitGoal {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  current_month_spent: number;
  current_month_target: number;
  percentage_used: number;
  is_compliant: boolean;
  current_streak: number;
  status: 'safe' | 'warning' | 'exceeded';
}

export interface FeedbackNote {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Utility functions
export function generateId(): string {
  return crypto.randomUUID();
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatCurrency(amount: number, currency: string = '€', decimals: boolean = true): string {
  const fractionDigits = decimals ? 2 : 0;
  return `${currency}${amount.toLocaleString('de-DE', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;
}

// Auth types
export interface User {
  id: string;
  email: string;
  displayName?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthSession {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface LocalAuthState {
  id: number;
  user_id: string | null;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  last_sync_at: string | null;
}

// Sync types
export type SyncOperation = 'insert' | 'update' | 'delete';

export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  user_id: string | null;
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingChanges: number;
  error: string | null;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
}
