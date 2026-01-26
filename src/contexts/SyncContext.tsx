/**
 * SyncContext
 *
 * Provides sync status and controls to the React application.
 * Uses the SyncService from RepositoryContext for actual sync operations.
 */

import type { SyncResult, SyncStatusState } from '@/lib/sync/types';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useRepositories } from './RepositoryContext';

interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingChanges: number;
  deadLetterCount: number;
  error: string | null;
}

interface SyncContextValue {
  status: SyncStatus;
  isSyncing: boolean;
  isOnline: boolean;
  isReady: boolean; // True when sync service is initialized and ready
  hasCompletedInitialSync: boolean; // True after initial sync has run (success or failure)
  sync: () => Promise<SyncResult>;
  refreshStatus: () => Promise<void>;
  retryDeadLetters: () => Promise<number>;
  clearSyncQueue: (failedOnly?: boolean) => Promise<number>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const { isAuthenticated, isConfigured, isLoading } = useAuth();
  const { syncService, isInitialized } = useRepositories();

  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    pendingChanges: 0,
    deadLetterCount: 0,
    error: null,
  });
  const [hasCompletedInitialSync, setHasCompletedInitialSync] = useState(false);

  // Subscribe to sync service status changes
  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribe = syncService.onStatusChange((syncStatus: SyncStatusState, error?: string) => {
      setStatus(prev => ({
        ...prev,
        isSyncing: syncStatus === 'syncing',
        error: syncStatus === 'error' ? (error || 'Sync failed') : null,
        lastSyncAt: syncService.lastSyncAt,
      }));
    });

    return unsubscribe;
  }, [syncService, isInitialized]);

  // Update online status from sync service
  useEffect(() => {
    if (!isInitialized) return;

    const updateOnlineStatus = () => {
      setStatus(prev => ({
        ...prev,
        isOnline: syncService.isOnline,
      }));
    };

    // Check periodically
    updateOnlineStatus();
    const interval = setInterval(updateOnlineStatus, 5000);

    return () => clearInterval(interval);
  }, [syncService, isInitialized]);

  // Refresh pending changes count periodically
  const refreshStatus = useCallback(async () => {
    if (!isInitialized || !isAuthenticated) return;

    try {
      const [pendingChanges, deadLetterCount] = await Promise.all([
        syncService.getPendingCount(),
        syncService.getDeadLetterCount(),
      ]);

      setStatus(prev => ({
        ...prev,
        pendingChanges,
        deadLetterCount,
        lastSyncAt: syncService.lastSyncAt,
        isOnline: syncService.isOnline,
        isSyncing: syncService.isSyncing,
      }));
    } catch (error) {
      console.error('Failed to refresh sync status:', error);
    }
  }, [syncService, isInitialized, isAuthenticated]);

  // Refresh status periodically
  useEffect(() => {
    if (!isAuthenticated || !isConfigured || !isInitialized) return;

    refreshStatus();
    const interval = setInterval(refreshStatus, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated, isConfigured, isInitialized, refreshStatus]);

  // Trigger initial sync when authenticated
  useEffect(() => {
    // Don't do anything while auth is still loading - wait for it to settle
    if (isLoading) {
      return;
    }

    if (isAuthenticated && isConfigured && isInitialized && syncService.isOnline) {
      console.log('[SyncContext] Starting initial sync...');
      syncService.fullSync().then((result) => {
        console.log('[SyncContext] Initial sync complete:', result);
        refreshStatus();
        setHasCompletedInitialSync(true);
      }).catch((error) => {
        console.error('[SyncContext] Initial sync failed:', error);
        setHasCompletedInitialSync(true); // Still mark as complete so app can proceed
      });
    } else if (!isConfigured) {
      // If Supabase is not configured, mark initial sync as "complete"
      // so the app doesn't wait for a sync that will never happen
      // Note: We don't mark complete when just not authenticated - the user needs to log in first
      setHasCompletedInitialSync(true);
    }
  }, [isAuthenticated, isConfigured, isInitialized, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useCallback(async (): Promise<SyncResult> => {
    console.log('[SyncContext] sync() called', { isAuthenticated, isConfigured, isInitialized });

    if (!isAuthenticated || !isConfigured) {
      console.log('[SyncContext] sync() skipped - not authenticated or not configured');
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        errors: ['Not authenticated or Supabase not configured'],
        deadLettered: 0,
      };
    }

    if (!isInitialized) {
      console.log('[SyncContext] sync() skipped - not initialized');
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        errors: ['Sync service not initialized'],
        deadLettered: 0,
      };
    }

    console.log('[SyncContext] sync() calling fullSync...');
    const result = await syncService.fullSync();
    console.log('[SyncContext] sync() fullSync complete:', result);
    await refreshStatus();
    return result;
  }, [syncService, isAuthenticated, isConfigured, isInitialized, refreshStatus]);

  const retryDeadLetters = useCallback(async (): Promise<number> => {
    if (!isInitialized) return 0;

    const retried = await syncService.retryAllDeadLetters();
    await refreshStatus();
    return retried;
  }, [syncService, isInitialized, refreshStatus]);

  const clearSyncQueue = useCallback(async (failedOnly = false): Promise<number> => {
    if (!isInitialized) return 0;

    const cleared = await syncService.clearSyncQueue(failedOnly);
    await refreshStatus();
    return cleared;
  }, [syncService, isInitialized, refreshStatus]);

  const value: SyncContextValue = {
    status,
    isSyncing: status.isSyncing,
    isOnline: status.isOnline,
    isReady: isInitialized,
    hasCompletedInitialSync,
    sync,
    refreshStatus,
    retryDeadLetters,
    clearSyncQueue,
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
