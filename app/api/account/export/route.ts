import { getCurrentUser } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Data access request: everything stored about the signed-in user, read through RLS. */
export async function GET(request: Request) {
  if (!(await rateLimit(request, "account-export", 10, 3600))) return tooManyRequests(3600);
  const { supabase, user } = await getCurrentUser();
  if (!supabase || !user) return Response.json({ error: "Sign in to download your data." }, { status: 401 });

  const [{ data: profile }, { data: scenarios }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("scenarios").select("id, name, patients, resources, created_at, updated_at").order("created_at"),
  ]);

  const body = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at },
    profile,
    scenarios: scenarios ?? [],
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="q-icu-my-data.json"`,
      "Cache-Control": "no-store",
    },
  });
}
