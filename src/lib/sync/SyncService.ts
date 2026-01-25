import { SupabaseClient } from "@supabase/supabase-js";
import { SyncQueue } from "./SyncQueue";

export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'idle' | 'syncing' | 'error';

export type SyncListener = (syncQueue: SyncQueue) => void;
export type SyncStatusListener = (status: SyncStatus) => void;

// export type SyncItem<T> = {
//   id: string,
//   type: SyncEntityType;
//   op: SyncOperation,
//   timestamp: number,
//   data: T,
// }

export interface Sync {
  sync: (syncQueue: SyncQueue) => Promise<void>;
}

export class SyncService {
  private isSyncing: boolean = false;
  private isOnlineInner: boolean;

  private listeners: SyncListener[];
  private statusListeners: SyncStatusListener[] = [];

  constructor(
    private readonly remoteDb: SupabaseClient,
    private readonly syncQueue: SyncQueue,

  ) {
    window.addEventListener("online", this.handleOnline.bind(this));
    window.addEventListener("offline", this.handleOffline.bind(this));

    this.isOnlineInner = navigator.onLine;
  }

  public get isOnline(): boolean {
    return this.isOnlineInner;
  }

  public subscribe(listener: SyncListener, statusListener?: SyncStatusListener) {
    this.listeners.push(listener);
    if (statusListener) {
      this.statusListeners.push(statusListener);
    }

    const unsubscribe = () => {
      this.listeners = this.listeners.filter((listener) => listener !== listener);
      this.statusListeners = this.statusListeners.filter((listener) => listener !== listener);
    }

    return [unsubscribe];
  }

  private async sync() {
    if (!this.isOnlineInner) return;

    this.isSyncing = true;

    for (const listener of this.listeners) {
      listener(this.syncQueue);
    }
  }

  private handleOnline = () => {
    this.isOnlineInner = true;
    this.sync();
  }

  private handleOffline = () => {
    this.isOnlineInner = false;
  }

  private publishStatus() {

  }

}
