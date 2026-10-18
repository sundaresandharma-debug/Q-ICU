export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** The anon / publishable key is meant to be public. Row level security protects the data. */
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
