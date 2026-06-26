import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://txjuhzgnnrfzsmsuexnu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4anVoemdubnJmenNtc3VleG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NzAyNTYsImV4cCI6MjA5ODA0NjI1Nn0.6OZMKocFn5cRDBTiIe8R-JLCqEibzX5RWlgzvWiImb0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'nano-bricks-auth',
    // 30-day session — also set JWT expiry to 2592000s in Supabase Dashboard → Auth → Settings
    detectSessionInUrl: false,
  },
});

export type { Session, User } from '@supabase/supabase-js';
