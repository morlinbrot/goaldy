/**
 * Push Token Service
 *
 * Manages FCM push token registration with the Supabase backend.
 * Handles token registration, refresh, and cleanup.
 */

import { getCurrentUserId } from './auth';
import { getFCMTokenWithRetry, isFCMAvailable, isTokenSentToServer, markTokenAsSent } from './fcm';
import { getSupabase } from './supabase';
import { generateId } from './types';

/**
 * Detect the current platform.
 */
function getPlatform(): 'android' | 'ios' | 'web' {
  // Check for Android
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
    return 'android';
  }
  // Check for iOS
  if (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    return 'ios';
  }
  return 'web';
}

/**
 * Get device info for identification.
 */
function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const ua = navigator.userAgent;
  const platform = navigator.platform || 'unknown';

  // Extract meaningful device info
  const androidMatch = ua.match(/Android\s+(\d+(?:\.\d+)?)/);
  if (androidMatch) {
    return `Android ${androidMatch[1]}`;
  }

  const iosMatch = ua.match(/OS\s+(\d+(?:_\d+)?)/);
  if (iosMatch) {
    return `iOS ${iosMatch[1].replace('_', '.')}`;
  }

  return platform;
}

/**
 * Register the current device's push token with the backend.
 *
 * This should be called:
 * - On app startup (after user is authenticated)
 * - When notification preferences are enabled
 * - When a token refresh is detected
 */
export async function registerPushToken(): Promise<boolean> {
  // Only proceed if FCM is available
  if (!isFCMAvailable()) {
    console.log('[PushToken] FCM not available on this platform');
    return false;
  }

  // Check if user is authenticated
  const userId = await getCurrentUserId();
  if (!userId) {
    console.log('[PushToken] User not authenticated, skipping registration');
    return false;
  }

  // Check if token was already sent in this session
  if (isTokenSentToServer()) {
    console.log('[PushToken] Token already registered in this session');
    return true;
  }

  // Get FCM token
  const token = await getFCMTokenWithRetry();
  if (!token) {
    console.error('[PushToken] Failed to get FCM token');
    return false;
  }

  console.log('[PushToken] Registering token with backend...');

  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[PushToken] Supabase client not available');
      return false;
    }

    const platform = getPlatform();
    const deviceInfo = getDeviceInfo();
    const now = new Date().toISOString();

    // Upsert the token (insert or update if exists)
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          id: generateId(),
          user_id: userId,
          token: token,
          platform: platform,
          device_info: deviceInfo,
          created_at: now,
          updated_at: now,
        },
        {
          onConflict: 'user_id,token',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error('[PushToken] Failed to register token:', error);
      return false;
    }

    // Mark token as sent so we don't re-register unnecessarily
    markTokenAsSent();
    console.log('[PushToken] Token registered successfully');
    return true;
  } catch (error) {
    console.error('[PushToken] Error registering token:', error);
    return false;
  }
}

/**
 * Unregister the current device's push token.
 *
 * Call this when:
 * - User logs out
 * - User disables notifications
 */
export async function unregisterPushToken(): Promise<boolean> {
  if (!isFCMAvailable()) {
    return true; // Nothing to unregister
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return true; // Nothing to unregister
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return false;
    }

    // Delete all tokens for this user on this platform
    const platform = getPlatform();
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform);

    if (error) {
      console.error('[PushToken] Failed to unregister token:', error);
      return false;
    }

    console.log('[PushToken] Token unregistered successfully');
    return true;
  } catch (error) {
    console.error('[PushToken] Error unregistering token:', error);
    return false;
  }
}

/**
 * Initialize push token registration.
 * Should be called after user authentication is confirmed.
 */
export async function initializePushTokens(): Promise<void> {
  if (!isFCMAvailable()) {
    console.log('[PushToken] FCM not available, skipping initialization');
    return;
  }

  // Attempt to register the token
  await registerPushToken();
}

/**
 * Send a test push notification via the server.
 * This triggers a real FCM push to verify the full notification pipeline.
 */
export async function sendTestPushNotification(): Promise<{ success: boolean; message?: string; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase not available' };
    }

    // Get the current session to include auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'No active session' };
    }

    // Call the Edge Function with explicit auth header and user_id in body as fallback
    const { data, error } = await supabase.functions.invoke('send-test-notification', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        user_id: userId,
      },
    });

    if (error) {
      console.error('[PushToken] Test notification error:', error);
      return { success: false, error: error.message };
    }

    if (data?.success) {
      return { success: true, message: data.message };
    } else {
      return { success: false, error: data?.error || 'Unknown error' };
    }
  } catch (error) {
    console.error('[PushToken] Test notification failed:', error);
    return { success: false, error: String(error) };
  }
}
