/**
 * RemoteDataSource
 *
 * Generic Supabase data source implementation.
 * Each entity repository creates an instance with the appropriate table configuration.
 */

import { getFullSession } from '@/lib/auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SyncableEntity } from '../types';
import type { RemoteDataSource as IRemoteDataSource } from './types';

export class RemoteDataSource<T extends SyncableEntity> implements IRemoteDataSource<T> {
  constructor(
    private readonly tableName: string,
    private readonly columns: string[]
  ) {}

  /**
   * Setup auth session before making requests.
   */
  private async setupAuth(): Promise<ReturnType<typeof getSupabase>> {
    if (!isSupabaseConfigured()) {
      return null;
    }

    const supabase = getSupabase();
    if (!supabase) return null;

    const session = await getFullSession();
    if (!session) return null;

    await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    return supabase;
  }

  async getById(id: string, userId: string): Promise<T | null> {
    const supabase = await this.setupAuth();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(error.message);
    }

    return data as T;
  }

  async getChangedSince(userId: string, since: string | null): Promise<T[]> {
    const supabase = await this.setupAuth();
    if (!supabase) return [];

    let query = supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId);

    if (since) {
      query = query.gt('updated_at', since);
    }

    const { data, error } = await query.order('updated_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as T[];
  }

  async upsert(item: T, userId: string): Promise<void> {
    const supabase = await this.setupAuth();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    // Build the data object with only the columns we want
    const data: Record<string, unknown> = { user_id: userId };
    for (const col of this.columns) {
      if (col in item) {
        data[col] = (item as Record<string, unknown>)[col];
      }
    }

    const { error } = await supabase
      .from(this.tableName)
      .upsert(data, { onConflict: 'id' });

    if (error) {
      throw new Error(error.message);
    }
  }

  async delete(id: string, userId: string, deletedAt: string): Promise<void> {
    const supabase = await this.setupAuth();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    // Soft delete by setting deleted_at
    const { error } = await supabase
      .from(this.tableName)
      .update({
        deleted_at: deletedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  // ============ Additional Utility Methods ============

  /**
   * Get all items for a user (including deleted).
   */
  async getAll(userId: string): Promise<T[]> {
    const supabase = await this.setupAuth();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as T[];
  }

  /**
   * Batch upsert items.
   */
  async upsertMany(items: T[], userId: string): Promise<void> {
    const supabase = await this.setupAuth();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    if (items.length === 0) return;

    const dataArray = items.map(item => {
      const data: Record<string, unknown> = { user_id: userId };
      for (const col of this.columns) {
        if (col in item) {
          data[col] = (item as Record<string, unknown>)[col];
        }
      }
      return data;
    });

    const { error } = await supabase
      .from(this.tableName)
      .upsert(dataArray, { onConflict: 'id' });

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Hard delete an item (use with caution).
   */
  async hardDelete(id: string, userId: string): Promise<void> {
    const supabase = await this.setupAuth();
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Check if remote is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const supabase = await this.setupAuth();
      return supabase !== null;
    } catch {
      return false;
    }
  }
}
