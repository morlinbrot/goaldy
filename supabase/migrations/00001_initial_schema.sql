-- Goaldy Database Schema - Supabase Migration
-- This migration creates all tables for the Goaldy app with Row Level Security.
--
-- Run this on a fresh Supabase project.
-- WARNING: This will replace any existing schema!

-- ============================================
-- User Profiles (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Categories
-- ============================================
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_custom INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Default categories (user_id = NULL) are readable by all authenticated users
CREATE POLICY "Users can view default and own categories"
  ON public.categories FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON public.categories FOR DELETE
  USING (auth.uid() = user_id);

-- Insert default categories
INSERT INTO public.categories (id, user_id, name, icon, color, is_custom, is_hidden, sort_order, created_at, updated_at)
VALUES
  ('cat_groceries', NULL, 'Groceries', '🛒', '#22c55e', 0, 0, 1, NOW(), NOW()),
  ('cat_dining', NULL, 'Dining', '🍽️', '#f97316', 0, 0, 2, NOW(), NOW()),
  ('cat_transport', NULL, 'Transport', '🚗', '#3b82f6', 0, 0, 3, NOW(), NOW()),
  ('cat_entertainment', NULL, 'Entertainment', '🎬', '#a855f7', 0, 0, 4, NOW(), NOW()),
  ('cat_shopping', NULL, 'Shopping', '🛍️', '#ec4899', 0, 0, 5, NOW(), NOW()),
  ('cat_health', NULL, 'Health', '💊', '#14b8a6', 0, 0, 6, NOW(), NOW()),
  ('cat_utilities', NULL, 'Utilities', '💡', '#eab308', 0, 0, 7, NOW(), NOW()),
  ('cat_subscriptions', NULL, 'Subscriptions', '📱', '#6366f1', 0, 0, 8, NOW(), NOW()),
  ('cat_other', NULL, 'Other', '📦', '#6b7280', 0, 0, 9, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Budgets
-- ============================================
CREATE TABLE IF NOT EXISTS public.budgets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  total_amount REAL NOT NULL,
  spending_limit REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_budgets_updated ON public.budgets(updated_at);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budgets"
  ON public.budgets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budgets"
  ON public.budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
  ON public.budgets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
  ON public.budgets FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Expenses
-- ============================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  category_id TEXT REFERENCES public.categories(id),
  note TEXT,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_updated ON public.expenses(updated_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses"
  ON public.expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
  ON public.expenses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
  ON public.expenses FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Savings Goals
-- ============================================
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  target_date TEXT NOT NULL,
  monthly_contribution REAL NOT NULL,
  why_statement TEXT,
  privacy_level TEXT DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON public.savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_updated ON public.savings_goals(updated_at);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own savings goals"
  ON public.savings_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own savings goals"
  ON public.savings_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings goals"
  ON public.savings_goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings goals"
  ON public.savings_goals FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Savings Contributions
-- ============================================
CREATE TABLE IF NOT EXISTS public.savings_contributions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  is_full_amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_savings_contributions_goal ON public.savings_contributions(goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_contributions_updated ON public.savings_contributions(updated_at);

ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own savings contributions"
  ON public.savings_contributions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own savings contributions"
  ON public.savings_contributions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings contributions"
  ON public.savings_contributions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings contributions"
  ON public.savings_contributions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Habit Goals
-- ============================================
CREATE TABLE IF NOT EXISTS public.habit_goals (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES public.categories(id),
  rule_type TEXT NOT NULL, -- 'max_amount', 'max_percentage', 'reduce_by'
  rule_value REAL NOT NULL,
  duration_months INTEGER,
  start_date TEXT NOT NULL,
  privacy_level TEXT DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_habit_goals_user ON public.habit_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_goals_category ON public.habit_goals(category_id);
CREATE INDEX IF NOT EXISTS idx_habit_goals_updated ON public.habit_goals(updated_at);

ALTER TABLE public.habit_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own habit goals"
  ON public.habit_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habit goals"
  ON public.habit_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habit goals"
  ON public.habit_goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own habit goals"
  ON public.habit_goals FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Habit Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.habit_tracking (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_goal_id TEXT NOT NULL REFERENCES public.habit_goals(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  spent_amount REAL NOT NULL,
  target_amount REAL NOT NULL,
  is_compliant INTEGER, -- 1 = met target, 0 = exceeded
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_habit_tracking_goal ON public.habit_tracking(habit_goal_id);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_month ON public.habit_tracking(month);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_updated ON public.habit_tracking(updated_at);

ALTER TABLE public.habit_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own habit tracking"
  ON public.habit_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habit tracking"
  ON public.habit_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habit tracking"
  ON public.habit_tracking FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own habit tracking"
  ON public.habit_tracking FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Feedback Notes
-- ============================================
CREATE TABLE IF NOT EXISTS public.feedback_notes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feedback_notes_user ON public.feedback_notes(user_id);

ALTER TABLE public.feedback_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback notes"
  ON public.feedback_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback notes"
  ON public.feedback_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback notes"
  ON public.feedback_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own feedback notes"
  ON public.feedback_notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Notification Preferences
-- ============================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notifications_enabled BOOLEAN DEFAULT true,
  monthly_checkin_enabled BOOLEAN DEFAULT true,
  monthly_checkin_cron TEXT DEFAULT '0 9 2 * *',
  progress_updates_enabled BOOLEAN DEFAULT true,
  progress_updates_cron TEXT DEFAULT '0 10 * * 1',
  why_reminders_enabled BOOLEAN DEFAULT true,
  why_reminders_cron TEXT DEFAULT '0 19 * * 1',
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '08:00',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification preferences"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_updated_at();

-- ============================================
-- Scheduled Notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  goal_id TEXT REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  cron_expression TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled ON public.scheduled_notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_type ON public.scheduled_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user ON public.scheduled_notifications(user_id);

ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled notifications"
  ON public.scheduled_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled notifications"
  ON public.scheduled_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled notifications"
  ON public.scheduled_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled notifications"
  ON public.scheduled_notifications FOR DELETE
  USING (auth.uid() = user_id);
