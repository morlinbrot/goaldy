/**
 * FeedbackNotesRepository
 *
 * Repository for managing feedback notes with offline-first sync.
 */

import type { FeedbackNote } from '@/lib/types';
import type { SyncService } from '../services/SyncService';
import { SYNC_TABLES, type SyncTableName } from '../types';
import { BaseRepository } from './BaseRepository';

export class FeedbackNotesRepository extends BaseRepository<FeedbackNote> {
  readonly tableName: SyncTableName = SYNC_TABLES.FEEDBACK_NOTES;

  protected readonly columns = [
    'id',
    'user_id',
    'content',
    'created_at',
    'updated_at',
    'deleted_at',
  ];

  constructor(syncService: SyncService) {
    super(syncService);
    this.initializeDataSources();
  }

  // ============ Entity-Specific Queries ============

  /**
   * Get recent feedback notes.
   */
  async getRecent(limit: number = 10): Promise<FeedbackNote[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM feedback_notes
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Search feedback notes by content.
   */
  async search(query: string): Promise<FeedbackNote[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM feedback_notes
       WHERE content LIKE $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [`%${query}%`]
    );
  }

  /**
   * Get feedback notes by date range.
   */
  async getByDateRange(startDate: string, endDate: string): Promise<FeedbackNote[]> {
    return this.localDataSource.customQuery(
      `SELECT * FROM feedback_notes
       WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [startDate, endDate]
    );
  }
}
