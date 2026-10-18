"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

let client: SupabaseClient | null = null;

/** Returns null when accounts are not configured on this deployment. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
