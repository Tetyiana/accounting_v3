import { createClient } from '@supabase/supabase-js';

// Ключі з .env (Vite): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// anon key безпечний для фронтенду — доступ обмежує RLS на сервері.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
export const isSupabaseConfigured = !!supabase;
