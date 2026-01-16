import { useSync } from '@/contexts/SyncContext';
import { useAuth } from '@/contexts/AuthContext';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, status } = useSync();
  const { isAuthenticated, isConfigured } = useAuth();

  // Only show if authenticated, configured, and offline
  if (!isAuthenticated || !isConfigured || isOnline) {
    return null;
  }

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2">
      <div className="flex items-center justify-center gap-2 text-sm text-yellow-600">
        <WifiOff className="h-4 w-4" />
        <span>
          You're offline.
          {status.pendingChanges > 0 && (
            <> {status.pendingChanges} change{status.pendingChanges > 1 ? 's' : ''} will sync when you're back online.</>
          )}
        </span>
      </div>
    </div>
  );
}
