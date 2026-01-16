// Database types matching SQLite schema

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_custom: number;
  is_hidden: number;
  sort_order: number | null;
  created_at: string;
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
  name: string;
  target_amount: number;
  target_date: string;
  monthly_contribution: number;
  why_statement: string | null;
  privacy_level: 'private' | 'progress_only' | 'full';
  created_at: string;
  updated_at: string;
}

export interface SavingsContribution {
  id: string;
  goal_id: string;
  month: string;
  amount: number;
  is_full_amount: number | null;
  created_at: string;
}

export interface HabitGoal {
  id: string;
  name: string;
  category_id: string | null;
  rule_type: 'max_amount' | 'max_percentage' | 'reduce_by';
  rule_value: number;
  duration_months: number | null;
  start_date: string;
  privacy_level: 'private' | 'progress_only' | 'full';
  created_at: string;
  updated_at: string;
}

export interface FeedbackNote {
  id: string;
  content: string;
  created_at: string;
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

export function formatCurrency(amount: number, currency: string = '€'): string {
  return `${currency}${amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
