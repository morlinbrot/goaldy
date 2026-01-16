// Supabase configuration from environment variables
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Validate configuration
export function validateSupabaseConfig(): boolean {
  if (!SUPABASE_URL || SUPABASE_URL === 'https://your-project.supabase.co') {
    console.warn('Supabase URL not configured. Cloud sync will be disabled.');
    return false;
  }
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'your-anon-key') {
    console.warn('Supabase anon key not configured. Cloud sync will be disabled.');
    return false;
  }
  return true;
}
