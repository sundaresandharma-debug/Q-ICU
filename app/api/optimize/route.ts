import { rateLimit, tooManyRequests, hashedClientKey } from "@/lib/rate-limit";

const MAX_BODY = 256 * 1024;

/**
 * Server-side proxy to the Python optimizer. The backend URL and API key live
 * only in server env vars, so neither reaches the browser.
 */
export async function POST(request: Request) {
  if (!(await rateLimit(request, "optimize", 10, 60))) return tooManyRequests(60);
  const backend = process.env.BACKEND_URL;
  if (!backend) return Response.json({ error: "The optimizer backend is not connected on this deployment." }, { status: 503 });

  const body = await request.text();
  if (body.length > MAX_BODY) return Response.json({ error: "Request is too large. Send at most 100 patients." }, { status: 413 });

  try {
    const res = await fetch(`${backend.replace(/\/$/, "")}/api/optimize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.BACKEND_API_KEY ?? "",
        "X-Client-Key": await hashedClientKey(request),
      },
      body,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return Response.json(
      { error: timedOut ? "The optimizer took longer than 60 seconds. Try fewer patients or fewer shots." : "The optimizer backend could not be reached." },
      { status: timedOut ? 504 : 502 },
    );
  }
}
