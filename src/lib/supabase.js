import { createClient } from '@supabase/supabase-js';

// Publishable key безпечний для фронтенду — доступ обмежує RLS на сервері.
// env-змінні мають пріоритет (для локальної розробки через .env).
const url = import.meta.env.VITE_SUPABASE_URL  || 'https://ggsaaymebyotodpjjukb.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_h-f0UaUZVyXjeD9Rj2T7-w_B97wydX1';

export const supabase = createClient(url, key);
export const isSupabaseConfigured = true;
