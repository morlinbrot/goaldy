import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dailyAt, everyNDays, monthlyOnDay, parseCron, weeklyOnMonday } from "@/lib/cron";
import { isFCMAvailable } from "@/lib/fcm";
import {
    checkNotificationPermission,
    DEFAULT_PREFERENCES,
    getNotificationPreferences,
    type NotificationPreferences,
    type PermissionStatus,
    requestNotificationPermission,
    saveNotificationPreferences
} from "@/lib/notifications";
import { registerPushToken, sendTestPushNotification, unregisterPushToken } from "@/lib/push-token-service";
import { AlertTriangle, ArrowLeft, Bell, BellOff, Calendar, Clock, Loader2, MessageCircle, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface NotificationSettingsProps {
  onBack: () => void;
}

type Frequency = 'daily' | 'weekly' | 'every_few_days' | 'never';
type ParsedFrequency = 'daily' | 'weekly' | 'every_few_days' | 'monthly';

/** Build a cron expression from frequency and time */
function buildCron(frequency: Frequency | ParsedFrequency, time: string): string {
  switch (frequency) {
    case 'daily':
      return dailyAt(time).expression;
    case 'weekly':
    case 'monthly': // Treat monthly as weekly for progress/why (shouldn't happen but handle it)
      return weeklyOnMonday(time).expression;
    case 'every_few_days':
      return everyNDays(3, time).expression;
    case 'never':
      return '';
    default:
      return dailyAt(time).expression;
  }
}

/** Build a monthly cron expression from day and time */
function buildMonthlyCron(day: number, time: string): string {
  return monthlyOnDay(day, time).expression;
}

export function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | 'loading'>('loading');
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [fcmAvailable, setFcmAvailable] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load preferences from database (and sync first if online)
  // This ensures we always have the latest data when opening this view
  const loadPreferences = useCallback(async () => {
    // Check if FCM is available
    setFcmAvailable(isFCMAvailable());

    // Check permission status
    const status = await checkNotificationPermission();
    setPermissionStatus(status);

    // Load preferences from database
    try {
      const preferences = await getNotificationPreferences();
      setPrefs(preferences);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
      // Set default preferences so UI can render
      const now = new Date().toISOString();
      setPrefs({
        id: 1,
        user_id: null,
        ...DEFAULT_PREFERENCES,
        created_at: now,
        updated_at: now,
      });
    }
  }, []);

  // Load initial state when component mounts
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      // Request permission
      await requestNotificationPermission();
      // Re-check the actual status after the system dialog closes
      const actualStatus = await checkNotificationPermission();
      setPermissionStatus(actualStatus);

      // If permission granted, register push token
      if (actualStatus === 'granted') {
        await registerPushToken();
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleSave = useCallback(async (updates: Partial<NotificationPreferences>) => {
    if (!prefs) return;
    setIsSaving(true);
    try {
      const newPrefs = await saveNotificationPreferences(updates);
      setPrefs(newPrefs);

      // Handle push token registration based on master toggle
      if (updates.notifications_enabled !== undefined) {
        if (updates.notifications_enabled) {
          await registerPushToken();
        } else {
          await unregisterPushToken();
        }
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setIsSaving(false);
    }
  }, [prefs]);

  const handleToggle = useCallback(async (key: keyof NotificationPreferences, value: boolean) => {
    await handleSave({ [key]: value });
  }, [handleSave]);

  // Parse cron expressions for UI display
  const monthlyParsed = prefs ? parseCron(prefs.monthly_checkin_cron) : null;
  const progressParsed = prefs ? parseCron(prefs.progress_updates_cron) : null;
  const whyParsed = prefs ? parseCron(prefs.why_reminders_cron) : null;

  // Handlers for monthly check-in
  const handleMonthlyDayChange = useCallback(async (day: number) => {
    if (!prefs || !monthlyParsed || day < 1 || day > 28) return;
    const newCron = buildMonthlyCron(day, monthlyParsed.time);
    await handleSave({ monthly_checkin_cron: newCron });
  }, [prefs, monthlyParsed, handleSave]);

  const handleMonthlyTimeChange = useCallback(async (time: string) => {
    if (!prefs || !monthlyParsed) return;
    const newCron = buildMonthlyCron(monthlyParsed.dayOfMonth || 2, time);
    await handleSave({ monthly_checkin_cron: newCron });
  }, [prefs, monthlyParsed, handleSave]);

  // Handlers for progress updates
  const handleProgressFrequencyChange = useCallback(async (frequency: Frequency) => {
    if (!prefs || !progressParsed) return;
    if (frequency === 'never') {
      await handleSave({ progress_updates_enabled: false });
    } else {
      const newCron = buildCron(frequency, progressParsed.time);
      await handleSave({ progress_updates_cron: newCron, progress_updates_enabled: true });
    }
  }, [prefs, progressParsed, handleSave]);

  const handleProgressTimeChange = useCallback(async (time: string) => {
    if (!prefs || !progressParsed) return;
    const newCron = buildCron(progressParsed.frequency, time);
    await handleSave({ progress_updates_cron: newCron });
  }, [prefs, progressParsed, handleSave]);

  // Handlers for why reminders
  const handleWhyFrequencyChange = useCallback(async (frequency: Frequency) => {
    if (!prefs || !whyParsed) return;
    if (frequency === 'never') {
      await handleSave({ why_reminders_enabled: false });
    } else {
      const newCron = buildCron(frequency, whyParsed.time);
      await handleSave({ why_reminders_cron: newCron, why_reminders_enabled: true });
    }
  }, [prefs, whyParsed, handleSave]);

  const handleWhyTimeChange = useCallback(async (time: string) => {
    if (!prefs || !whyParsed) return;
    const newCron = buildCron(whyParsed.frequency, time);
    await handleSave({ why_reminders_cron: newCron });
  }, [prefs, whyParsed, handleSave]);

  // Show loading only while initially loading
  if (permissionStatus === 'loading' || prefs === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Notifications are disabled if permission is not granted or unavailable
  const notificationsDisabled = permissionStatus !== 'granted';

  // Get current frequency for progress (or 'never' if disabled)
  // Map 'monthly' to 'weekly' since progress updates don't support monthly
  const progressFrequency: Frequency = prefs.progress_updates_enabled
    ? ((progressParsed?.frequency === 'monthly' ? 'weekly' : progressParsed?.frequency) || 'weekly')
    : 'never';

  // Get current frequency for why reminders (or 'never' if disabled)
  const whyFrequency: Frequency = prefs.why_reminders_enabled
    ? ((whyParsed?.frequency === 'monthly' ? 'weekly' : whyParsed?.frequency) || 'weekly')
    : 'never';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold">Notification Settings</h1>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Unavailable Warning */}
        {permissionStatus === 'unavailable' && (
          <Card className="border-red-500/50 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">Notifications Unavailable</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The notification system is not available on this device. This may be due to missing permissions or platform limitations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Permission Request Card */}
        {permissionStatus === 'denied' && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <BellOff className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Notifications Disabled</p>
                  <p className="text-sm text-muted-foreground">
                    Enable notifications to receive reminders
                  </p>
                </div>
                <Button
                  onClick={handleRequestPermission}
                  size="sm"
                  disabled={isRequestingPermission}
                >
                  {isRequestingPermission ? 'Enabling...' : 'Enable'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Master Toggle */}
        <Card className={notificationsDisabled ? 'opacity-50' : ''}>
          <CardContent className="p-4">
            <ToggleRow
              icon={<Bell className="w-5 h-5" />}
              label="Enable Notifications"
              description="Master toggle for all notifications"
              checked={prefs.notifications_enabled}
              onChange={(v) => handleToggle('notifications_enabled', v)}
              disabled={notificationsDisabled || isSaving}
            />
          </CardContent>
        </Card>

        {/* Monthly Check-in */}
        <Card className={notificationsDisabled || !prefs.notifications_enabled ? 'opacity-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Monthly Check-in Reminder
            </CardTitle>
            <CardDescription>
              Get reminded to record your savings each month
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              label="Enable"
              checked={prefs.monthly_checkin_enabled}
              onChange={(v) => handleToggle('monthly_checkin_enabled', v)}
              disabled={notificationsDisabled || !prefs.notifications_enabled || isSaving}
            />
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground">Day of month</label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={monthlyParsed?.dayOfMonth || 2}
                  onChange={(e) => handleMonthlyDayChange(parseInt(e.target.value) || 2)}
                  disabled={notificationsDisabled || !prefs.notifications_enabled || !prefs.monthly_checkin_enabled || isSaving}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-muted-foreground">Time</label>
                <Input
                  type="time"
                  defaultValue={monthlyParsed?.time || '09:00'}
                  onBlur={(e) => handleMonthlyTimeChange(e.target.value)}
                  disabled={notificationsDisabled || !prefs.notifications_enabled || !prefs.monthly_checkin_enabled || isSaving}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Updates */}
        <Card className={notificationsDisabled || !prefs.notifications_enabled ? 'opacity-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Progress Updates
            </CardTitle>
            <CardDescription>
              Get updates on your savings progress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Frequency</label>
              <FrequencySelector
                value={progressFrequency}
                onChange={(v) => handleProgressFrequencyChange(v as Frequency)}
                options={[
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'never', label: 'Never' },
                ]}
                disabled={notificationsDisabled || !prefs.notifications_enabled || isSaving}
              />
            </div>
            {progressFrequency !== 'never' && (
              <div>
                <label className="text-sm text-muted-foreground">Time</label>
                <Input
                  type="time"
                  defaultValue={progressParsed?.time || '10:00'}
                  onBlur={(e) => handleProgressTimeChange(e.target.value)}
                  disabled={notificationsDisabled || !prefs.notifications_enabled || isSaving}
                  className="mt-1"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Why Reminders */}
        <Card className={notificationsDisabled || !prefs.notifications_enabled ? 'opacity-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              "Why" Reminders
            </CardTitle>
            <CardDescription>
              Motivational reminders with your goal's purpose
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Frequency</label>
              <FrequencySelector
                value={whyFrequency}
                onChange={(v) => handleWhyFrequencyChange(v as Frequency)}
                options={[
                  { value: 'daily', label: 'Daily' },
                  { value: 'every_few_days', label: 'Every few days' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'never', label: 'Never' },
                ]}
                disabled={notificationsDisabled || !prefs.notifications_enabled || isSaving}
              />
            </div>
            {whyFrequency !== 'never' && (
              <div>
                <label className="text-sm text-muted-foreground">Time</label>
                <Input
                  type="time"
                  defaultValue={whyParsed?.time || '19:00'}
                  onBlur={(e) => handleWhyTimeChange(e.target.value)}
                  disabled={notificationsDisabled || !prefs.notifications_enabled || isSaving}
                  className="mt-1"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Push Notification Status */}
        {!notificationsDisabled && prefs.notifications_enabled && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Push Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    {fcmAvailable
                      ? "Your device is registered for push notifications"
                      : "Push notifications are only available on Android"}
                  </p>
                </div>
              </div>
              {fcmAvailable && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <p className="text-sm font-medium">Test Notification</p>
                    <p className="text-xs text-muted-foreground">
                      {testResult
                        ? (testResult.success ? testResult.message : testResult.message)
                        : "Send a test push to verify it's working"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setIsSendingTest(true);
                      setTestResult(null);
                      const result = await sendTestPushNotification();
                      setTestResult({
                        success: result.success,
                        message: result.success
                          ? (result.message || 'Sent!')
                          : (result.error || 'Failed to send')
                      });
                      setIsSendingTest(false);
                      // Clear result after 5 seconds
                      setTimeout(() => setTestResult(null), 5000);
                    }}
                    disabled={isSendingTest}
                  >
                    {isSendingTest ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : testResult?.success ? (
                      'Sent!'
                    ) : (
                      'Send Test'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isSaving && (
          <p className="text-center text-sm text-muted-foreground">Saving...</p>
        )}
      </div>
    </div>
  );
}

// Helper component: Toggle row
interface ToggleRowProps {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ icon, label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-medium">{label}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// Helper component: Frequency selector (pill buttons)
interface FrequencySelectorProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}

function FrequencySelector({ value, onChange, options, disabled }: FrequencySelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
          className={`px-3 py-1.5 rounded-full text-sm transition-all border-2 ${
            value === option.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-transparent bg-secondary'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-secondary/80'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
