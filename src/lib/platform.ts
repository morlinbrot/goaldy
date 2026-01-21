/**
 * Platform detection utilities.
 *
 * Detects whether the app is running in Tauri (native) or browser mode.
 */

/**
 * Check if the app is running inside Tauri.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' &&
         window.__TAURI_INTERNALS__ !== undefined;
}

/**
 * Check if the app is running in a browser (not Tauri).
 */
export function isBrowser(): boolean {
  return !isTauri();
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
