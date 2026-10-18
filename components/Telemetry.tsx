"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CONSENT_EVENT, analyticsAllowed } from "@/lib/consent";

const MAX_ERRORS_PER_PAGE = 5;
let errorsSent = 0;

function send(body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  if (navigator.sendBeacon) navigator.sendBeacon("/api/telemetry", new Blob([json], { type: "application/json" }));
  else fetch("/api/telemetry", { method: "POST", body: json, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

/** Error reports carry no personal data: message, path and a trimmed stack. */
export function reportError(error: unknown, digest?: string) {
  if (typeof window === "undefined" || errorsSent >= MAX_ERRORS_PER_PAGE) return;
  errorsSent += 1;
  const e = error instanceof Error ? error : new Error(String(error));
  send({ type: "error", message: e.message.slice(0, 500), stack: e.stack?.slice(0, 2000), digest, path: location.pathname });
}

/**
 * First-party page-view counting (consent required) and error tracking.
 * No cookies, no IP storage, no third-party scripts.
 */
export function Telemetry() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportError(ev.error ?? ev.message);
    const onRejection = (ev: PromiseRejectionEvent) => reportError(ev.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);

  useEffect(() => {
    const track = () => {
      if (!analyticsAllowed() || lastSent.current === pathname) return;
      lastSent.current = pathname;
      let referrerHost: string | null = null;
      try { referrerHost = document.referrer ? new URL(document.referrer).host : null; } catch { /* ignore */ }
      if (referrerHost === location.host) referrerHost = null;
      send({ type: "pageview", path: pathname, referrerHost });
    };
    track();
    window.addEventListener(CONSENT_EVENT, track);
    return () => window.removeEventListener(CONSENT_EVENT, track);
  }, [pathname]);

  return null;
}
