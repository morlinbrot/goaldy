import { getBrowserDatabase } from './browser-database';
import { isTauri } from './platform';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { AuthSession, AuthState, LocalAuthState } from './types';

// Database interface that both Tauri SQLite and BrowserDatabase implement
interface DatabaseInterface {
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

// Local database instance for auth (avoids circular dependency with database.ts)
let authDb: DatabaseInterface | null = null;

async function getAuthDatabase(): Promise<DatabaseInterface> {
  if (!authDb) {
    if (isTauri()) {
      // Use Tauri SQLite plugin
      const Database = (await import("@tauri-apps/plugin-sql")).default;
      authDb = await Database.load("sqlite:goaldy.db");
    } else {
      // Use browser sql.js database
      const browserDb = getBrowserDatabase();
      await browserDb.init();
      authDb = browserDb;
    }
  }
  return authDb;
}

/**
 * Get the current auth session from local SQLite storage.
 */
export async function getLocalAuthState(): Promise<LocalAuthState | null> {
  const db = await getAuthDatabase();
  const result = await db.select<LocalAuthState[]>(
    'SELECT * FROM auth_state WHERE id = 1'
  );
  return result[0] || null;
}

/**
 * Save auth session to local SQLite storage.
 */
export async function saveLocalAuthState(session: AuthSession | null): Promise<void> {
  const db = await getAuthDatabase();

  if (session) {
    await db.execute(
      `INSERT INTO auth_state (id, user_id, email, access_token, refresh_token, expires_at)
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         user_id = $1,
         email = $2,
         access_token = $3,
         refresh_token = $4,
         expires_at = $5`,
      [session.userId, session.email, session.accessToken, session.refreshToken, session.expiresAt]
    );
  } else {
    // Clear auth state
    await db.execute(
      `DELETE FROM auth_state WHERE id = 1`
    );
  }
}

/**
 * Update the last sync timestamp.
 */
export async function updateLastSyncAt(timestamp: string): Promise<void> {
  const db = await getAuthDatabase();
  await db.execute(
    `UPDATE auth_state SET last_sync_at = $1 WHERE id = 1`,
    [timestamp]
  );
}

/**
 * Check if the session token is expired.
 */
function isSessionExpired(expiresAt: string): boolean {
  const expiry = new Date(expiresAt);
  const now = new Date();
  // Consider expired if less than 5 minutes remaining
  return expiry.getTime() - now.getTime() < 5 * 60 * 1000;
}

/**
 * Initialize auth - check for existing valid session.
 */
export async function initAuth(): Promise<AuthState> {
  // If Supabase is not configured, return unauthenticated state
  if (!isSupabaseConfigured()) {
    return {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };
  }

  try {
    const localAuth = await getLocalAuthState();

    if (!localAuth?.access_token || !localAuth.expires_at) {
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    }

    // Check if session is expired
    if (isSessionExpired(localAuth.expires_at)) {
      // Try to refresh
      const refreshedSession = await refreshSession(localAuth.refresh_token!);
      if (refreshedSession) {
        return {
          user: {
            id: refreshedSession.userId,
            email: refreshedSession.email,
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        };
      } else {
        // Refresh failed, clear session
        await saveLocalAuthState(null);
        return {
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        };
      }
    }

    // Session is valid
    return {
      user: {
        id: localAuth.user_id!,
        email: localAuth.email!,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };
  } catch (error) {
    console.error('Failed to initialize auth:', error);
    return {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: 'Failed to initialize authentication',
    };
  }
}

/**
 * Sign up with email and password.
 */
export async function signUp(email: string, password: string): Promise<AuthSession> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user || !data.session) {
    throw new Error('Signup failed - please check your email for verification');
  }

  const session: AuthSession = {
    userId: data.user.id,
    email: data.user.email!,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token!,
    expiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
  };

  // Save session locally
  await saveLocalAuthState(session);

  // Associate existing local data with this user
  await associateLocalDataWithUser(session.userId);

  return session;
}

/**
 * Log in with email and password.
 */
export async function logIn(email: string, password: string): Promise<AuthSession> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user || !data.session) {
    throw new Error('Login failed');
  }

  const session: AuthSession = {
    userId: data.user.id,
    email: data.user.email!,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token!,
    expiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
  };

  // Save session locally
  await saveLocalAuthState(session);

  // Associate existing local data with this user
  await associateLocalDataWithUser(session.userId);

  return session;
}

/**
 * Log out - clear session locally and remotely.
 */
export async function logOut(): Promise<void> {
  const supabase = getSupabase();

  // Clear local session first (even if remote logout fails)
  await saveLocalAuthState(null);

  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Remote logout failed:', error);
      // Continue anyway - local session is cleared
    }
  }
}

/**
 * Refresh the session using the refresh token.
 */
export async function refreshSession(refreshToken: string): Promise<AuthSession | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      console.error('Failed to refresh session:', error);
      return null;
    }

    const session: AuthSession = {
      userId: data.user!.id,
      email: data.user!.email!,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token!,
      expiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
    };

    // Save refreshed session locally
    await saveLocalAuthState(session);

    return session;
  } catch (error) {
    console.error('Failed to refresh session:', error);
    return null;
  }
}

/**
 * Get the current user ID (or null if not authenticated).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const localAuth = await getLocalAuthState();
  return localAuth?.user_id || null;
}

/**
 * Get the current access token (for API calls).
 */
export async function getAccessToken(): Promise<string | null> {
  const localAuth = await getLocalAuthState();

  if (!localAuth?.access_token || !localAuth.expires_at) {
    return null;
  }

  // Check if token needs refresh
  if (isSessionExpired(localAuth.expires_at) && localAuth.refresh_token) {
    const refreshedSession = await refreshSession(localAuth.refresh_token);
    return refreshedSession?.accessToken || null;
  }

  return localAuth.access_token;
}

/**
 * Get the full auth session (access token + refresh token) for Supabase client.
 */
export async function getFullSession(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const localAuth = await getLocalAuthState();

  if (!localAuth?.access_token || !localAuth.refresh_token || !localAuth.expires_at) {
    return null;
  }

  // Check if token needs refresh
  if (isSessionExpired(localAuth.expires_at)) {
    const refreshedSession = await refreshSession(localAuth.refresh_token);
    if (refreshedSession) {
      return {
        accessToken: refreshedSession.accessToken,
        refreshToken: refreshedSession.refreshToken,
      };
    }
    return null;
  }

  return {
    accessToken: localAuth.access_token,
    refreshToken: localAuth.refresh_token,
  };
}

/**
 * Associate existing local data (budgets, expenses) with the user.
 * Called after signup/login to mark existing local data as belonging to this user.
 */
async function associateLocalDataWithUser(userId: string): Promise<void> {
  const db = await getAuthDatabase();

  // Associate budgets that don't have a user_id
  await db.execute(
    `UPDATE budgets SET user_id = $1 WHERE user_id IS NULL`,
    [userId]
  );

  // Associate expenses that don't have a user_id
  await db.execute(
    `UPDATE expenses SET user_id = $1 WHERE user_id IS NULL`,
    [userId]
  );
}
