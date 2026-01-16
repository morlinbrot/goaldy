import { initAuth, logIn, logOut, signUp } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { AuthState, User } from '@/lib/types';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  skipAuth: () => void;
  isConfigured: boolean;
  hasSkippedAuth: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSkippedAuth, setHasSkippedAuth] = useState(false);

  const isConfigured = isSupabaseConfigured();
  console.log('[AuthContext] isConfigured:', isConfigured);

  // Initialize auth on mount
  useEffect(() => {
    async function init() {
      console.log('[AuthContext] init() starting');
      try {
        const authState = await initAuth();
        console.log('[AuthContext] initAuth returned:', authState);
        setUser(authState.user);
        setIsAuthenticated(authState.isAuthenticated);
        setError(authState.error);
      } catch (err) {
        console.error('[AuthContext] Auth initialization failed:', err);
        setError('Failed to initialize authentication');
      } finally {
        console.log('[AuthContext] init() complete, setting isLoading=false');
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await logIn(email, password);
      setUser({
        id: session.userId,
        email: session.email,
      });
      setIsAuthenticated(true);
      setHasSkippedAuth(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await signUp(email, password);
      setUser({
        id: session.userId,
        email: session.email,
      });
      setIsAuthenticated(true);
      setHasSkippedAuth(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logOut();
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Logout failed:', err);
      // Still clear local state even if remote logout fails
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const skipAuth = useCallback(() => {
    setHasSkippedAuth(true);
    setIsLoading(false);
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    signup,
    logout,
    clearError,
    skipAuth,
    isConfigured,
    hasSkippedAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
