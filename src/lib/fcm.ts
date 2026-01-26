/**
 * Firebase Cloud Messaging (FCM) service for push notifications.
 *
 * This module provides a TypeScript interface to the native Android FCM bridge.
 * On non-Android platforms, it provides stub implementations.
 */

import { isTauri } from './platform';

// Extend Window interface for the Android JavaScript bridge
declare global {
  interface Window {
    GoaldyFCM?: {
      getToken(): string;
      requestToken(): void;
      isTokenSent(): boolean;
      markTokenSent(): void;
    };
  }
}

/**
 * Check if FCM is available (Android only for now).
 */
export function isFCMAvailable(): boolean {
  return isTauri() && typeof window.GoaldyFCM !== 'undefined';
}

/**
 * Get the current FCM token.
 * Returns null if FCM is not available or token hasn't been generated yet.
 */
export function getFCMToken(): string | null {
  if (!isFCMAvailable()) {
    return null;
  }

  const token = window.GoaldyFCM!.getToken();
  return token || null;
}

/**
 * Request a fresh FCM token from Firebase.
 * The token will be stored locally and can be retrieved with getFCMToken().
 * This is an async operation - the token won't be immediately available.
 */
export function requestFCMToken(): void {
  if (!isFCMAvailable()) {
    console.log('[FCM] Not available on this platform');
    return;
  }

  window.GoaldyFCM!.requestToken();
}

/**
 * Check if the current FCM token has been sent to the server.
 */
export function isTokenSentToServer(): boolean {
  if (!isFCMAvailable()) {
    return false;
  }

  return window.GoaldyFCM!.isTokenSent();
}

/**
 * Mark the FCM token as sent to the server.
 * Call this after successfully registering the token with your backend.
 */
export function markTokenAsSent(): void {
  if (!isFCMAvailable()) {
    return;
  }

  window.GoaldyFCM!.markTokenSent();
}

/**
 * Get FCM token with retry logic.
 * Useful on app startup when the token might not be immediately available.
 */
export async function getFCMTokenWithRetry(
  maxAttempts: number = 5,
  delayMs: number = 1000
): Promise<string | null> {
  if (!isFCMAvailable()) {
    return null;
  }

  // Request a token first
  requestFCMToken();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = getFCMToken();
    if (token) {
      console.log(`[FCM] Token retrieved on attempt ${attempt}`);
      return token;
    }

    if (attempt < maxAttempts) {
      console.log(`[FCM] Token not ready, retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.warn('[FCM] Failed to get token after all attempts');
  return null;
}
