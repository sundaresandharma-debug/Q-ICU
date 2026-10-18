import "server-only";
import { getAdminSupabase } from "./supabase/server";

/**
 * Fixed-window rate limiting. Uses the `rate_limit_hit` Postgres function so
 * limits hold across serverless instances. Falls back to per-instance memory
 * when the database is not configured (local development).
 *
 * Client IPs are hashed with a server secret before use, so raw IPs are never stored.
 */
const memory = new Map<string, { start: number; hits: number }>();

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function hashedClientKey(req: Request): Promise<string> {
  const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-dev-salt";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${clientIp(req)}`));
  return Array.from(new Uint8Array(bytes).slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}

/** Returns true when the request is allowed. */
export async function rateLimit(req: Request, bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const key = `${bucket}:${await hashedClientKey(req)}`;
  const admin = getAdminSupabase();
  if (admin) {
    const { data, error } = await admin.rpc("rate_limit_hit", { p_bucket: key, p_max: max, p_window_seconds: windowSeconds });
    if (!error) return data === true;
    console.error(JSON.stringify({ level: "error", msg: "rate_limit_rpc_failed", error: error.message }));
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) { memory.set(key, { start: now, hits: 1 }); return true; }
  entry.hits += 1;
  return entry.hits <= max;
}

export function tooManyRequests(retryAfterSeconds: number) {
  return Response.json(
    { error: `Too many requests. Wait ${retryAfterSeconds} seconds, then try again.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
