import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/same-origin";

/** POST only, so a prefetch or a link on another site cannot sign someone out. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Cross-site request refused.", { status: 403 });
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
