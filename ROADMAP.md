# Goaldy - Product Specification & Implementation Roadmap

## Overview

Goaldy is a personal budgeting and savings motivation app. It prioritizes **speed of input** and **emotional motivation** over accounting precision—a "mindful spending companion" rather than a ledger.

### Core Principles

- **Phone-first**: Must be usable on mobile from day one
- **Speed over precision**: Logging an expense should take < 3 seconds
- **Motivation over guilt**: Celebrate progress, never shame failure
- **Offline-first**: Fully functional without internet, syncs when available

---

## Tech Stack

| Layer              | Technology                                     |
| ------------------ | ---------------------------------------------- |
| Frontend           | React 18 + TypeScript                          |
| Styling            | Tailwind CSS v3 + shadcn/ui                    |
| Mobile/Desktop     | Tauri v2                                       |
| Local DB           | SQLite (via `@tauri-apps/plugin-sql`)          |
| Backend            | Supabase (Postgres + Auth + Realtime)          |
| Push Notifications | Firebase Cloud Messaging                       |
| AI                 | Anthropic Claude API                           |
| Sync               | Supabase Realtime + custom conflict resolution |

---

## Feature Specification

### Module 1: Budget Tracker

#### Budget Setup (one-time, editable)

- **Simple mode**: User enters a single number ("I have €2,000 this month")
- **Detailed mode**: Income − Fixed expenses = Available amount
- **Spending limit**: "I only want to spend €X of the available amount"
- Remainder is implicitly available for savings goals

#### Home Screen: "What's Left"

- Large, central number showing remaining budget for current month
- Visual indicator (progress bar, color shift) as budget depletes
- Days remaining in month shown subtly
- Primary action: Quick expense entry (always accessible)

#### Quick Expense Entry

- Default view: Numpad with amount field, single tap to confirm
- Optional expansion: Category selector, note field, date (defaults to today)
- Smart suggestions: Based on time of day, recent entries
- Example: At 12:30, suggests "Lunch" category

#### Recent Entries View

- Scrollable list of recent expenses
- Tap to edit any field (amount, category, note, date)
- Swipe to delete
- Bulk categorization possible

#### Categories

- **Pre-defined**: Groceries, Dining, Transport, Entertainment, Shopping, Health, Utilities, Subscriptions, Other
- User can add custom categories
- User can hide/reorder pre-defined ones
- Each category has an icon and color

---

### Module 2: Savings Goals

#### Goal Creation (Manual)

- Target amount (e.g., €25,000)
- Target date (e.g., "December 2027")
- Monthly contribution amount (calculated suggestion shown, user can override)
- **"Why" prompt**: Free text—"What will achieving this goal mean to you?"
- Optional: Name the goal, add an image/icon

#### Goal Creation (AI-Assisted)

- Alternative to manual creation
- Conversational flow: AI asks about what user wants, why it matters, explores emotional motivation
- Outputs: Goal name, target amount, target date, "why" statement
- User can edit before confirming

#### Goal Dashboard

- Progress bar/visualization
- Stats:
  - Amount saved so far
  - Percentage complete
  - Months remaining
  - On-track indicator (based on current pace)
  - Projected completion date (if continuing at current rate)
- "Why" displayed prominently

#### Multiple Goals

- List view of all active goals
- Allocation view: Distribute monthly savings budget across goals
- Example: €500/month total → €300 to "House", €200 to "Vacation"

#### Monthly Check-in

- Triggered on the **3rd of each month** (covers previous month)
- Prompt: "Did you save this month?"
- Options:
  - "Yes, full amount!" → Confetti, celebration, streak increment
  - "Yes, but only €X" → Partial credit, encouragement
  - "Not this month" → Gentle message, no judgment, streak resets but total progress shown

---

### Module 3: Habit Goals

#### Habit Goal Types

- "Spend less than €X on [category] per month"
- "Keep [category] under X% of total spending"
- "Reduce [category] spending by X% compared to last month"

#### Tracking

- Automatic based on expense entries
- Progress shown in real-time as expenses are logged
- Alerts when approaching/exceeding limits

#### Celebrations

- Same streak and celebration system as savings goals
- Can be shared with buddies

---

### Module 4: Motivation Engine

#### Push Notifications (Native)

- Configurable frequency (daily, every few days, weekly)
- Content types:
  - Progress updates: "You're 34% toward your House goal!"
  - Why reminders: "Remember why you started: [user's why text]"
  - Gentle nudges: "Have you logged your expenses today?"
  - Celebrations: "3-month streak! You're building a great habit."
  - Monthly check-in reminder (sent on 2nd of month)
- Tone: Warm, supportive, never guilt-inducing

#### In-App Achievements/Badges

- Streak badges (1 week, 1 month, 3 months, 6 months, 1 year)
- Milestone badges (10%, 25%, 50%, 75%, 90%, 100% of goal)
- Consistency badges (logged expenses every day this week)
- Displayed on profile/settings screen

#### Monthly Savings Celebration

- Full-screen moment when user confirms monthly savings
- Confetti animation
- Updated stats

---

### Module 5: Social/Buddies

#### Friend System

- Add friends by username/email/invite link
- Accept/decline friend requests

#### Privacy Levels (per goal)

- **Private**: Only you see it
- **Buddies (progress only)**: Friends see "Sarah hit 50% of a goal!" but not details
- **Buddies (full)**: Friends see goal name, amount, progress

#### Activity Feed

- Timeline of friends' achievements
- "High five" reaction button
- Push notifications for friend activity

#### Notifications

- "Your friend Max just completed their monthly savings!"
- "Sarah hit a milestone—send a high five?"

---

## Implementation Roadmap

### Phase 0: Scaffolding & Device Deployment

**Goal**: App runs on your phone, even if it does nothing useful yet.

- [x] Tauri v2 project setup with React + TypeScript
- [x] Tailwind v3 + shadcn/ui configuration
- [x] Basic "Hello World" home screen
- [x] Build and deploy to phone (Android/iOS)
- [x] Set up development workflow

**Outcome**: You can open "Goaldy" on your phone.

---

### Phase 1: Local Budget Tracking MVP

**Goal**: Track expenses and see remaining budget. Fully functional offline.

- [x] SQLite schema: `budgets`, `expenses`, `categories`
- [x] Budget setup: Simple mode (single number)
- [x] Home screen: Remaining balance display
- [x] Quick expense entry: Numpad → amount → save
- [x] Pre-defined categories (tap to select, optional)
- [x] Recent expenses list
- [x] Edit/delete expenses

**Outcome**: You use this daily to track spending. No account needed.

---

### Phase 1.1: In-App Feedback Notes

**Goal**: Capture improvement ideas and feedback while using the app.

- [ ] SQLite table: `feedback_notes` (id, content, created_at)
- [ ] Floating feedback icon visible on all screens (small, unobtrusive)
- [ ] Tap icon → quick text input modal
- [ ] Save note with single tap (no extra confirmation)
- [ ] Feedback notes list accessible from settings/menu
- [ ] View and delete saved notes

**Outcome**: You can quickly jot down ideas for app improvements without leaving context.

---

### Phase 2: Auth & Cloud Sync

**Goal**: Data persists across devices.

- [ ] Supabase project setup
- [ ] Auth: Email/password registration & login
- [ ] Database schema in Supabase (mirrors local)
- [ ] Sync logic:
  - On app open: Pull remote changes
  - On local write: Queue for sync, push when online
  - Conflict resolution: Timestamp-based (last write wins)
- [ ] Offline queue with retry

**Outcome**: Use on phone and web, data syncs.

---

### Phase 3: Savings Goals

**Goal**: Create and track savings goals.

- [ ] Goal creation flow (manual): Name, amount, date, monthly contribution, "why"
- [ ] Goal dashboard: Progress bar, stats, "why" display
- [ ] Multiple goals with list view
- [ ] Allocation view (distribute monthly savings across goals)
- [ ] Monthly check-in flow (triggered on 3rd):
  - Prompt with options
  - Celebration screen with confetti
  - Streak tracking

**Outcome**: Core savings motivation loop working.

---

### Phase 4: Push Notifications

**Goal**: App reaches out to you.

- [ ] Firebase Cloud Messaging setup
- [ ] Backend: Scheduled jobs for notifications (Supabase Edge Functions)
- [ ] Notification types:
  - Monthly check-in reminder (2nd of month)
  - Progress updates (weekly)
  - "Why" reminders (configurable)
- [ ] Notification preferences in settings

**Outcome**: App actively engages you even when closed.

---

### Phase 5: Habit Goals

**Goal**: Track spending habits against targets.

- [ ] Habit goal creation: Category + rule (max amount, max percentage, reduction target)
- [ ] Automatic tracking against expenses
- [ ] Habit goal dashboard with progress
- [ ] Alerts when approaching/exceeding limits
- [ ] Celebration system (same as savings goals)

**Outcome**: Both savings and spending habits tracked.

---

### Phase 6: Social/Buddies

**Goal**: Accountability through friends.

- [ ] User profiles (username, optional display name)
- [ ] Friend system: Send/accept invites
- [ ] Privacy settings per goal
- [ ] Activity feed: Friends' achievements
- [ ] "High five" reactions
- [ ] Push notifications for friend activity

**Outcome**: Social motivation loop complete.

---

### Phase 7: AI Goal Creation

**Goal**: Guided goal creation through conversation.

- [ ] Chat UI component
- [ ] Claude API integration with system prompt
- [ ] Conversation flow: Explore motivation → extract goal parameters
- [ ] Review & confirm screen before creating goal
- [ ] "Why" statement generated from conversation

**Outcome**: Delightful onboarding for new goals.

---

### Phase 8: Polish & Enhancements

**Goal**: Production-ready app.

- [ ] Onboarding flow for new users
- [ ] Budget detailed mode (income − expenses)
- [ ] Smart category suggestions (time-based, history-based)
- [ ] Achievement badges UI
- [ ] Settings & preferences screen
- [ ] Data export (CSV/JSON)
- [ ] App store preparation

---

## Future Considerations (Post-Launch)

- **Bank integration**: Evaluate German/EU providers (Tink, Finleap Connect)
- **Recurring expense tracking**: Automatic detection and management
- **Budget analytics/reports**: Monthly summaries, category trends
- **Widgets**: Home screen balance widget
- **Wearables**: Apple Watch / WearOS companion app

---

## Database Schema (Initial)

### Local SQLite

```sql
-- Budget configuration
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL, -- "2026-01"
  total_amount REAL NOT NULL,
  spending_limit REAL, -- Optional cap
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Expense entries
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  category_id TEXT,
  note TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT, -- NULL if not yet synced
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_custom INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  sort_order INTEGER,
  created_at TEXT NOT NULL
);

-- Savings goals
CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  target_date TEXT NOT NULL,
  monthly_contribution REAL NOT NULL,
  why_statement TEXT,
  privacy_level TEXT DEFAULT 'private', -- 'private', 'progress_only', 'full'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Savings contributions (monthly check-ins)
CREATE TABLE savings_contributions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  month TEXT NOT NULL, -- "2026-01"
  amount REAL NOT NULL,
  is_full_amount INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES savings_goals(id)
);

-- Habit goals
CREATE TABLE habit_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT,
  rule_type TEXT NOT NULL, -- 'max_amount', 'max_percentage', 'reduce_by'
  rule_value REAL NOT NULL,
  duration_months INTEGER,
  start_date TEXT NOT NULL,
  privacy_level TEXT DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Sync queue for offline changes
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'insert', 'update', 'delete'
  payload TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL
);
```

---

## Notes

- **Region focus**: Germany/EU initially
- **Calendar month**: Budget periods are always calendar months
- **Offline-first**: All features must work offline, sync when available
- **No rollover**: Budget tracking is in-the-moment; no surplus/deficit rollover (for now)
