import "server-only";

/** Rejects cross-site form posts and fetches (basic CSRF protection for cookie-authenticated routes). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
