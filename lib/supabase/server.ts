import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

/** Per-request client that acts as the signed-in user (RLS applies). */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return null;
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        // Server Components cannot set cookies. The proxy refreshes the session instead.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only context */ }
      },
    },
  });
}

export async function getCurrentUser(): Promise<{ supabase: SupabaseClient | null; user: User | null }> {
  const supabase = await getServerSupabase();
  if (!supabase) return { supabase: null, user: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/**
 * Service-role client. Bypasses RLS, so it is only used in route handlers for
 * account deletion, telemetry inserts and rate limiting. Never import from client code.
 */
export function getAdminSupabase(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
