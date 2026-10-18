import { getAdminSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { validateEmail } from "@/lib/validation";

const TYPES = new Set(["deletion", "access", "correction"]);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  if (!(await rateLimit(request, "data-request", 3, 3600))) return tooManyRequests(3600);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const type = typeof body?.type === "string" ? body.type : "";
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 2000) : "";
  const errors: Record<string, string> = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!TYPES.has(type)) errors.type = "Choose what you would like us to do.";
  if (body?.consent !== true) errors.consent = "We need your permission to use your email for this request.";
  if (Object.keys(errors).length) return Response.json({ error: "Check the highlighted fields.", fields: errors }, { status: 400 });

  const admin = getAdminSupabase();
  if (!admin) return Response.json({ error: "Requests cannot be stored on this server right now. Email us instead." }, { status: 503 });
  const { error } = await admin.from("data_requests").insert({ email, request_type: type, details: details || null });
  if (error) return Response.json({ error: "We could not record your request. Try again, or email us." }, { status: 500 });
  return Response.json({ ok: true });
}
