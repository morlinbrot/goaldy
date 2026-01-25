// CREATE TABLE IF NOT EXISTS public.expenses (
//   id TEXT PRIMARY KEY,
//   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//   amount REAL NOT NULL,
//   category_id TEXT REFERENCES public.categories(id),
//   note TEXT,
//   date TEXT NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW(),
//   synced_at TIMESTAMPTZ,
//   deleted_at TIMESTAMPTZ
// );

import { SyncQueue } from "./SyncQueue";
import { SyncService } from "./SyncService";

export type Expense = {
  id: string,
  user_id: string,
  amount: number,
  date: string,
  category_id: string | null,
  note: string | null,
  created_at: Date,
  updated_at: Date | null
  synced_at: Date | null,
  deleted_at: Date | null,
}

export function isExpense(obj: any): obj is Expense {
  return (
    typeof obj.id === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.amount === 'number' &&
    typeof obj.date === 'string' &&
    (obj.category_id === null || typeof obj.category_id === 'string') &&
    (obj.note === null || typeof obj.note === 'string') &&
    obj.created_at instanceof Date &&
    (obj.updated_at === null || obj.updated_at instanceof Date) &&
    (obj.synced_at === null || obj.synced_at instanceof Date) &&
    (obj.deleted_at === null || obj.deleted_at instanceof Date)
  );
}

export class ExpensesRepository {

  constructor(
    private readonly syncService: SyncService,
  ) { }

  private async sync(syncQueue: SyncQueue) {
    const allItems = await syncQueue.getAllByType("Budget");

    for (const item of allItems) {
      const data = JSON.parse(item.data);

      if (!isExpense(data)) {
        console.error(`Invalid expense data: ${JSON.stringify(data)}`);
        // TODO: Push to dead letter queue
      };

      if (!this.syncService.isOnline) {
        console.error(`Sync service is offline`);
        await syncQueue.enqueue(item.type, item.operation, data)
        continue;
      }

      switch (item.operation) {
        case "create":
          await this.create(data);
          break;
        case "update":
          await this.update(data);
          break;
        case "delete":
          await this.delete(data.id);
          break;
      }

      // TODO
      const _remoteUpdates = this.pullFromRemote();
    }
  }

  private pullFromRemote() {
    // TODO
  }

  async create(expense: Expense): Promise<Expense> {
    return Promise.resolve(expense);
  }

  async update(expense: Expense): Promise<Expense> {
    return Promise.resolve(expense);
  }

  async delete(id: string): Promise<void> {
    return Promise.resolve();
  }
}
