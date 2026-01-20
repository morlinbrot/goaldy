import { getAllSavingsGoalsWithStats } from './database';
import {
    cancelNotificationsByType,
    checkAndSendDueNotifications,
    checkNotificationPermission,
    cleanupOldNotifications,
    getNotificationPreferences,
    scheduleNotification,
    showNotification,
    type NotificationPreferences
} from './notifications';
import type { SavingsGoalWithStats } from './types';

// Background notification checker state
let notificationCheckInterval: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

/**
 * Schedule monthly check-in reminder using cron.
 */
export async function scheduleMonthlyCheckInReminder(
  prefs: NotificationPreferences
): Promise<void> {
  // Cancel existing monthly check-in notifications
  await cancelNotificationsByType('monthly_checkin');

  if (!prefs.notifications_enabled || !prefs.monthly_checkin_enabled) {
    return;
  }

  await scheduleNotification(
    'Monthly Savings Check-in',
    'Time to record your savings for last month! How did you do?',
    prefs.monthly_checkin_cron,
    'monthly_checkin'
  );
}

/**
 * Schedule progress update notifications using cron.
 */
export async function scheduleProgressUpdates(
  prefs: NotificationPreferences
): Promise<void> {
  // Cancel existing progress update notifications
  await cancelNotificationsByType('progress_update');

  if (!prefs.notifications_enabled || !prefs.progress_updates_enabled) {
    return;
  }

  const goals = await getAllSavingsGoalsWithStats();
  if (goals.length === 0) return;

  // Pick the goal with highest percentage to highlight
  const topGoal = goals.reduce((best, goal) =>
    goal.percentage_complete > best.percentage_complete ? goal : best
  );

  const progressMessage = generateProgressMessage(topGoal, goals.length);

  await scheduleNotification(
    'Savings Progress Update',
    progressMessage,
    prefs.progress_updates_cron,
    'progress_update',
    topGoal.id
  );
}

/**
 * Schedule "why" reminder notifications using cron.
 */
export async function scheduleWhyReminders(
  prefs: NotificationPreferences
): Promise<void> {
  // Cancel existing why reminder notifications
  await cancelNotificationsByType('why_reminder');

  if (!prefs.notifications_enabled || !prefs.why_reminders_enabled) {
    return;
  }

  const goals = await getAllSavingsGoalsWithStats();
  const goalsWithWhy = goals.filter(g => g.why_statement && g.why_statement.trim() !== '');
  if (goalsWithWhy.length === 0) return;

  // Rotate through goals with why statements (use date-based selection for consistency)
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const goalIndex = dayOfYear % goalsWithWhy.length;
  const goal = goalsWithWhy[goalIndex];

  await scheduleNotification(
    `Remember: ${goal.name}`,
    `"${goal.why_statement}"`,
    prefs.why_reminders_cron,
    'why_reminder',
    goal.id
  );
}

/**
 * Generate a motivational progress message.
 */
function generateProgressMessage(goal: SavingsGoalWithStats, totalGoals: number): string {
  const percentage = Math.round(goal.percentage_complete);
  const goalContext = totalGoals > 1 ? ` (${totalGoals} goals total)` : '';

  if (percentage >= 100) {
    return `Congratulations! You've reached your goal "${goal.name}"!${goalContext}`;
  } else if (percentage >= 75) {
    return `Amazing! You're ${percentage}% toward "${goal.name}". Almost there!${goalContext}`;
  } else if (percentage >= 50) {
    return `Halfway there! You're ${percentage}% toward "${goal.name}". Keep going!${goalContext}`;
  } else if (percentage >= 25) {
    return `Great progress! You're ${percentage}% toward "${goal.name}".${goalContext}`;
  } else if (percentage > 0) {
    return `You're ${percentage}% toward your goal "${goal.name}". Every step counts!${goalContext}`;
  } else {
    return `Ready to start saving toward "${goal.name}"? Your journey begins with one step.${goalContext}`;
  }
}

/**
 * Reschedule all notifications based on current preferences.
 * Called when preferences change or on app start.
 * Always cancels existing and reschedules to pick up any cron changes.
 */
export async function rescheduleAllNotifications(): Promise<void> {
  const prefs = await getNotificationPreferences();

  if (!prefs.notifications_enabled) {
    // Cancel all scheduled notifications when master toggle is off
    await cancelNotificationsByType('monthly_checkin');
    await cancelNotificationsByType('progress_update');
    await cancelNotificationsByType('why_reminder');
    console.log('[Notifications] All notifications cancelled (master toggle off)');
    return;
  }

  // Always cancel and reschedule to pick up cron changes
  if (prefs.monthly_checkin_enabled) {
    await scheduleMonthlyCheckInReminder(prefs);
  } else {
    await cancelNotificationsByType('monthly_checkin');
  }

  if (prefs.progress_updates_enabled) {
    await scheduleProgressUpdates(prefs);
  } else {
    await cancelNotificationsByType('progress_update');
  }

  if (prefs.why_reminders_enabled) {
    await scheduleWhyReminders(prefs);
  } else {
    await cancelNotificationsByType('why_reminder');
  }
}

/**
 * Initialize notification system on app start.
 * - Checks for due notifications and sends them
 * - Ensures future notifications are scheduled
 * - Cleans up old notification records
 * - Starts background checker loop
 */
export async function initializeNotifications(): Promise<void> {
  try {
    // Check if we have notification permission
    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
      console.log('[Notifications] Permission not granted, skipping initialization');
      return;
    }

    console.log('[Notifications] Initializing...');

    // Check for due notifications (app was closed)
    await checkAndSendDueNotifications();

    // Ensure upcoming notifications are scheduled
    await rescheduleAllNotifications();

    // Clean up old notification records
    await cleanupOldNotifications();

    // Start the background checker
    startNotificationChecker();

    console.log('[Notifications] Initialization complete');
  } catch (error) {
    console.error('Failed to initialize notifications:', error);
  }
}

/**
 * Send a test notification to verify the system works.
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
      return false;
    }

    await showNotification(
      'Test Notification',
      'Notifications are working correctly!'
    );
    return true;
  } catch (error) {
    console.error('Failed to send test notification:', error);
    return false;
  }
}

/**
 * Start the background notification checker loop.
 * Aligns to run at :02 seconds past each minute to ensure notifications
 * scheduled for :00 have passed.
 */
export function startNotificationChecker(): void {
  if (notificationCheckInterval) {
    console.log('[Notifications] Checker already running');
    return;
  }

  // Calculate delay until next minute + 2 seconds
  const now = new Date();
  const secondsUntilNextMinute = 60 - now.getSeconds();
  const msUntilNextMinute = (secondsUntilNextMinute * 1000) - now.getMilliseconds();
  const initialDelay = msUntilNextMinute + 2000; // +2 seconds past the minute

  console.log(`[Notifications] Starting checker in ${Math.round(initialDelay / 1000)}s (aligning to :02)`);

  // Run immediately on start
  runNotificationCheck();

  // Wait until :02 of next minute, then start the interval
  setTimeout(() => {
    console.log('[Notifications] Checker aligned, running every 60s at :02');
    runNotificationCheck();
    notificationCheckInterval = setInterval(runNotificationCheck, CHECK_INTERVAL_MS);
  }, initialDelay);
}

/**
 * Stop the background notification checker loop.
 */
export function stopNotificationChecker(): void {
  if (notificationCheckInterval) {
    console.log('[Notifications] Stopping checker');
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }
}

/**
 * Run a single notification check cycle.
 */
async function runNotificationCheck(): Promise<void> {
  console.log('[Notifications] Running check...');
  try {
    const hasPermission = await checkNotificationPermission();
    if (!hasPermission) {
      console.log('[Notifications] No permission, skipping');
      return;
    }

    // Check and send due notifications
    await checkAndSendDueNotifications();
  } catch (error) {
    console.error('[Notifications] Check failed:', error);
  }
}
