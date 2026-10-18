import { getAdminSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const clip = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
/** Strip query strings and anything that looks like an ID so paths never carry personal data. */
const cleanPath = (v: unknown) => clip(typeof v === "string" ? v.split(/[?#]/)[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id") : null, 200);

export async function POST(request: Request) {
  if (!(await rateLimit(request, "telemetry", 60, 60))) return new Response(null, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return new Response(null, { status: 400 });
  const admin = getAdminSupabase();

  if (body.type === "pageview") {
    const path = cleanPath(body.path);
    if (!path || !admin) return new Response(null, { status: 204 });
    await admin.from("page_views").insert({ path, referrer_host: clip(body.referrerHost, 200) });
    return new Response(null, { status: 204 });
  }

  if (body.type === "error") {
    const row = { source: "client", message: clip(body.message, 500) ?? "Unknown error", digest: clip(body.digest, 100), path: cleanPath(body.path), stack: clip(body.stack, 2000) };
    if (admin) await admin.from("error_events").insert(row);
    else console.error(JSON.stringify({ level: "error", msg: "client_error", ...row }));
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 400 });
}
