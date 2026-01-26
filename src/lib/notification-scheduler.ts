/**
 * Notification Initialization
 *
 * With FCM (Firebase Cloud Messaging), notifications are sent server-side.
 * This module handles:
 * - Registering the device's FCM token on app startup
 * - Handling push token refresh
 *
 * The actual notification scheduling and sending is done by Supabase Edge Functions.
 */

import { isFCMAvailable } from './fcm';
import { checkNotificationPermission } from './notifications';
import { initializePushTokens, registerPushToken } from './push-token-service';

/**
 * Initialize the notification system.
 *
 * This registers the device for push notifications if:
 * - The user is authenticated
 * - FCM is available (Android)
 * - Notification permission is granted
 */
export async function initializeNotifications(): Promise<void> {
  try {
    // Check if FCM is available
    if (!isFCMAvailable()) {
      console.log('[Notifications] FCM not available on this platform');
      return;
    }

    // Check permission status
    const permissionStatus = await checkNotificationPermission();
    if (permissionStatus !== 'granted') {
      console.log('[Notifications] Permission not granted, skipping initialization');
      return;
    }

    console.log('[Notifications] Initializing push token registration...');

    // Register push token with backend
    await initializePushTokens();

    console.log('[Notifications] Initialization complete');
  } catch (error) {
    console.error('[Notifications] Initialization failed:', error);
  }
}

/**
 * Re-register push token.
 * Call this when notification preferences are enabled.
 */
export async function refreshPushToken(): Promise<void> {
  if (!isFCMAvailable()) {
    return;
  }

  await registerPushToken();
}

/**
 * Send a test notification.
 * Note: With FCM, this would need to go through the server.
 * For now, this is a placeholder that returns false.
 */
export async function sendTestNotification(): Promise<boolean> {
  console.log('[Notifications] Test notifications require server-side implementation with FCM');
  // TODO: Implement server endpoint for test notifications
  return false;
}

// Legacy exports for compatibility - these are no-ops now
export async function rescheduleAllNotifications(): Promise<void> {
  // No-op: Scheduling is now server-side
  console.log('[Notifications] Notification scheduling is now handled server-side');
}

export function startNotificationChecker(): void {
  // No-op: Notifications are pushed by server
}

export function stopNotificationChecker(): void {
  // No-op: No local checker needed
}
