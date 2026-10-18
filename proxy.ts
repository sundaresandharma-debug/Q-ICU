import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./lib/supabase/env";

const PROTECTED = ["/dashboard", "/account", "/onboarding"];
const GUEST_ONLY = ["/login", "/signup"];

const matches = (path: string, list: string[]) => list.some(p => path === p || path.startsWith(`${p}/`));

/** Refreshes the Supabase session cookie and guards signed-in pages. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!isSupabaseConfigured) {
    if (matches(path, PROTECTED)) {
      const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  const redirect = (pathname: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
  };

  if (!signedIn && matches(path, PROTECTED)) return redirect("/login", path);
  if (signedIn && matches(path, GUEST_ONLY)) return redirect("/dashboard");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/telemetry|icon.svg|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml)$).*)"],
};
