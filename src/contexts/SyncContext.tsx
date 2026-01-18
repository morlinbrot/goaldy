import { isOnline as checkIsOnline, fullSync, getSyncStatus } from '@/lib/sync';
import type { SyncResult, SyncStatus } from '@/lib/types';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface SyncContextValue {
  status: SyncStatus;
  isSyncing: boolean;
  sync: () => Promise<SyncResult>;
  refreshStatus: () => Promise<void>;
  isOnline: boolean;
}

const SyncContext = createContext<SyncContextValue | null>(null);

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const { isAuthenticated, isConfigured } = useAuth();
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    pendingChanges: 0,
    error: null,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(checkIsOnline());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Function to refresh sync status
  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated || !isConfigured) return;
    try {
      const newStatus = await getSyncStatus();
      setStatus(newStatus);
    } catch (error) {
      console.error('Failed to get sync status:', error);
    }
  }, [isAuthenticated, isConfigured]);

  // Update sync status periodically
  useEffect(() => {
    if (!isAuthenticated || !isConfigured) return;

    refreshStatus();
    const interval = setInterval(refreshStatus, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated, isConfigured, refreshStatus]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && isAuthenticated && isConfigured && status.pendingChanges > 0) {
      sync().catch(console.error);
    }
  }, [isOnline, isAuthenticated, isConfigured, status.pendingChanges]);

  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!isAuthenticated || !isConfigured) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        errors: ['Not authenticated or Supabase not configured'],
      };
    }

    if (isSyncing) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        errors: ['Sync already in progress'],
      };
    }

    setIsSyncing(true);
    setStatus(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await fullSync();

      // Update status after sync
      const newStatus = await getSyncStatus();
      const error = result.errors.length > 0 ? result.errors[0] : null
      if (error) {
        console.error("[Sync Error]", error);
      }
      setStatus({
        ...newStatus,
        isSyncing: false,
        error,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      console.error("[Sync Error]", errorMessage);
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: errorMessage,
      }));
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        errors: [errorMessage],
      };
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, isConfigured, isSyncing]);

  // Trigger initial sync when authenticated
  useEffect(() => {
    if (isAuthenticated && isConfigured && isOnline) {
      sync().catch(console.error);
    }
  }, [isAuthenticated, isConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: SyncContextValue = {
    status,
    isSyncing,
    sync,
    refreshStatus,
    isOnline,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
