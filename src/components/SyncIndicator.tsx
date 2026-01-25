import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { AlertCircle, Check, CloudOff, CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function SyncIndicator() {
  const { status, isSyncing, sync, isOnline, refreshStatus, clearSyncQueue } = useSync();
  const { isAuthenticated, isConfigured } = useAuth();
  const [isResetting, setIsResetting] = useState(false);

  // Don't show if not authenticated or Supabase not configured
  if (!isAuthenticated || !isConfigured) {
    return null;
  }

  const handleSync = async () => {
    if (!isSyncing) {
      await sync();
    }
  };

  const handleResetQueue = async () => {
    setIsResetting(true);
    try {
      await clearSyncQueue(); // Clear all items from the queue
      await refreshStatus();
    } catch (error) {
      console.error('Failed to reset sync queue:', error);
    } finally {
      setIsResetting(false);
    }
  };

  // Determine icon and color based on status
  const getStatusDisplay = () => {
    if (!isOnline) {
      return {
        icon: <CloudOff className="h-4 w-4" />,
        color: 'text-muted-foreground',
        title: 'Offline',
      };
    }

    if (isSyncing) {
      return {
        icon: <RefreshCw className="h-4 w-4 animate-spin" />,
        color: 'text-blue-500',
        title: 'Syncing...',
      };
    }

    if (status.error) {
      return {
        icon: <AlertCircle className="h-4 w-4" />,
        color: 'text-destructive',
        title: `Sync error: ${status.error}`,
      };
    }

    if (status.pendingChanges > 0) {
      return {
        icon: <CloudUpload className="h-4 w-4" />,
        color: 'text-blue-400',
        title: `${status.pendingChanges} pending change${status.pendingChanges > 1 ? 's' : ''}`,
      };
    }

    return {
      icon: <Check className="h-4 w-4" />,
      color: 'text-green-500',
      title: status.lastSyncAt
        ? `Last synced: ${formatRelativeTime(status.lastSyncAt)}`
        : 'Synced',
    };
  };

  const { icon, color, title } = getStatusDisplay();

  return (
    <div className="flex items-center gap-1">
      {status.error && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={handleResetQueue}
          disabled={isResetting || isSyncing}
          title="Reset sync queue and retry"
        >
          {isResetting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 ${color}`}
        onClick={handleSync}
        disabled={isSyncing || !isOnline}
        title={title}
      >
        {icon}
      </Button>
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
