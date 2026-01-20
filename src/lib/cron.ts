import CronExpressionParser from 'cron-parser';

/**
 * Cron schedule utilities for notification scheduling.
 *
 * We use standard 5-field cron expressions:
 * - minute (0-59)
 * - hour (0-23)
 * - day of month (1-31)
 * - month (1-12)
 * - day of week (0-7, where 0 and 7 are Sunday)
 */

export interface CronSchedule {
  expression: string;
  description: string;
}

/** Parsed components from a cron expression for UI display */
export interface ParsedCron {
  minute: number;
  hour: number;
  dayOfMonth: number | null;  // null if wildcard
  dayOfWeek: number | null;   // null if wildcard (0=Sun, 1=Mon, etc.)
  time: string;               // "HH:MM" format
  frequency: 'daily' | 'weekly' | 'monthly' | 'every_few_days';
}

/**
 * Parse a cron expression into UI-friendly components.
 */
export function parseCron(expression: string): ParsedCron | null {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minuteStr, hourStr, dayOfMonthStr, , dayOfWeekStr] = parts;
    const minute = parseInt(minuteStr, 10);
    const hour = parseInt(hourStr, 10);
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Determine frequency based on day fields
    let frequency: ParsedCron['frequency'];
    let dayOfMonth: number | null = null;
    let dayOfWeek: number | null = null;

    if (dayOfMonthStr !== '*' && !dayOfMonthStr.includes('/')) {
      // Specific day of month = monthly
      frequency = 'monthly';
      dayOfMonth = parseInt(dayOfMonthStr, 10);
    } else if (dayOfMonthStr.includes('/')) {
      // Every N days
      frequency = 'every_few_days';
    } else if (dayOfWeekStr !== '*') {
      // Specific day of week = weekly
      frequency = 'weekly';
      dayOfWeek = parseInt(dayOfWeekStr, 10);
    } else {
      // Both wildcards = daily
      frequency = 'daily';
    }

    return { minute, hour, dayOfMonth, dayOfWeek, time, frequency };
  } catch {
    return null;
  }
}

/**
 * Get human-readable description of a cron expression.
 */
export function describeCron(expression: string): string {
  const parsed = parseCron(expression);
  if (!parsed) return expression;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  switch (parsed.frequency) {
    case 'daily':
      return `Daily at ${parsed.time}`;
    case 'weekly':
      return `${days[parsed.dayOfWeek || 0]}s at ${parsed.time}`;
    case 'monthly':
      return `${ordinal(parsed.dayOfMonth || 1)} of each month at ${parsed.time}`;
    case 'every_few_days':
      return `Every few days at ${parsed.time}`;
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Create a cron expression for a specific time daily.
 * @param time Time in "HH:MM" format
 */
export function dailyAt(time: string): CronSchedule {
  const [hours, minutes] = time.split(':').map(Number);
  return {
    expression: `${minutes} ${hours} * * *`,
    description: `Daily at ${time}`,
  };
}

/**
 * Create a cron expression for a specific time on a specific day of month.
 * @param day Day of month (1-28)
 * @param time Time in "HH:MM" format
 */
export function monthlyOnDay(day: number, time: string): CronSchedule {
  const [hours, minutes] = time.split(':').map(Number);
  return {
    expression: `${minutes} ${hours} ${day} * *`,
    description: `Monthly on day ${day} at ${time}`,
  };
}

/**
 * Create a cron expression for a specific time on Mondays (weekly).
 * @param time Time in "HH:MM" format
 */
export function weeklyOnMonday(time: string): CronSchedule {
  const [hours, minutes] = time.split(':').map(Number);
  return {
    expression: `${minutes} ${hours} * * 1`,
    description: `Weekly on Monday at ${time}`,
  };
}

/**
 * Create a cron expression for every N days at a specific time.
 * Note: Cron doesn't natively support "every N days", so we approximate
 * by using specific days of the month that are roughly N days apart.
 * For exact N-day intervals, use the interval-based approach.
 * @param days Number of days between occurrences
 * @param time Time in "HH:MM" format
 */
export function everyNDays(days: number, time: string): CronSchedule {
  const [hours, minutes] = time.split(':').map(Number);
  // For "every few days" we use an interval-based calculation instead of cron
  // This is handled specially in getNextExecutionTime
  return {
    expression: `${minutes} ${hours} */${days} * *`,
    description: `Every ${days} days at ${time}`,
  };
}

/**
 * Parse a cron expression and get the next execution time.
 * @param expression Cron expression (5 fields)
 * @param from Optional starting point (defaults to now)
 * @returns Next execution time as Date, or null if invalid
 */
export function getNextExecutionTime(expression: string, from?: Date): Date | null {
  try {
    const cronExpr = CronExpressionParser.parse(expression, {
      currentDate: from || new Date(),
    });
    return cronExpr.next().toDate();
  } catch (error) {
    console.error('Failed to parse cron expression:', expression, error);
    return null;
  }
}

/**
 * Get the next N execution times for a cron expression.
 * @param expression Cron expression (5 fields)
 * @param count Number of future times to return
 * @param from Optional starting point (defaults to now)
 */
export function getNextExecutionTimes(expression: string, count: number, from?: Date): Date[] {
  try {
    const cronExpr = CronExpressionParser.parse(expression, {
      currentDate: from || new Date(),
    });
    const times: Date[] = [];
    for (let i = 0; i < count; i++) {
      times.push(cronExpr.next().toDate());
    }
    return times;
  } catch (error) {
    console.error('Failed to parse cron expression:', expression, error);
    return [];
  }
}

/**
 * Check if a cron expression is valid.
 */
export function isValidCronExpression(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert user-facing frequency settings to a cron expression.
 */
export function frequencyToCron(
  frequency: 'daily' | 'weekly' | 'every_few_days' | 'never',
  time: string
): CronSchedule | null {
  switch (frequency) {
    case 'daily':
      return dailyAt(time);
    case 'weekly':
      return weeklyOnMonday(time);
    case 'every_few_days':
      return everyNDays(3, time);
    case 'never':
      return null;
  }
}

/**
 * Convert monthly check-in settings to a cron expression.
 */
export function monthlyCheckinToCron(day: number, time: string): CronSchedule {
  return monthlyOnDay(day, time);
}
