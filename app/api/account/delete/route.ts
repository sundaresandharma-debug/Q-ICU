import { getAdminSupabase, getCurrentUser } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!(await rateLimit(request, "account-delete", 5, 3600))) return tooManyRequests(3600);

  const { user } = await getCurrentUser();
  if (!user) return Response.json({ error: "Your session has ended. Sign in again, then retry." }, { status: 401 });

  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  if (typeof body?.confirm !== "string" || body.confirm.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return Response.json({ error: "Type your email address exactly as shown to confirm." }, { status: 400 });
  }

  const admin = getAdminSupabase();
  if (!admin) return Response.json({ error: "Account deletion is not configured on this server. Use the data request form instead." }, { status: 503 });

  // Deleting the auth user cascades to profiles and scenarios (ON DELETE CASCADE).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(JSON.stringify({ level: "error", msg: "account_delete_failed", error: error.message }));
    return Response.json({ error: "We could not delete your account. Try again in a few minutes." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
