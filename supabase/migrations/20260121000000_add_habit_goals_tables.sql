-- Add habit goals and tracking tables for cloud sync

-- Habit goals (user-specific spending habit targets)
CREATE TABLE IF NOT EXISTS public.habit_goals (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- 'max_amount', 'max_percentage', 'reduce_by'
  rule_value REAL NOT NULL,
  duration_months INTEGER, -- NULL for ongoing habits
  start_date TEXT NOT NULL,
  privacy_level TEXT DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Habit tracking (monthly snapshots of habit compliance)
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_habit_goals_user ON public.habit_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_goals_category ON public.habit_goals(category_id);
CREATE INDEX IF NOT EXISTS idx_habit_goals_updated ON public.habit_goals(updated_at);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_goal ON public.habit_tracking(habit_goal_id);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_month ON public.habit_tracking(month);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_updated ON public.habit_tracking(updated_at);

-- Enable Row Level Security
ALTER TABLE public.habit_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_tracking ENABLE ROW LEVEL SECURITY;

-- Habit goals: Users can CRUD their own goals
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

-- Habit tracking: Users can CRUD their own tracking records
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
