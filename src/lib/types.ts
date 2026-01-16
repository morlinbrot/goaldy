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
  month: string; // "2026-01"
  total_amount: number;
  spending_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  amount: number;
  category_id: string | null;
  note: string | null;
  date: string;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
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
