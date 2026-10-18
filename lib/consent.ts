"use client";

/**
 * Cookie consent. The choice itself is stored in a first-party, strictly
 * necessary cookie. Analytics stays off until the visitor opts in, and a
 * Global Privacy Control signal counts as "no" until they choose otherwise.
 */
export type Consent = { analytics: boolean };

const COOKIE = "qicu_consent";
const MAX_AGE = 60 * 60 * 24 * 180;
export const CONSENT_EVENT = "qicu:consent";
export const OPEN_SETTINGS_EVENT = "qicu:open-cookie-settings";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.split("; ").find(c => c.startsWith(`${COOKIE}=`))?.split("=")[1];
  if (raw === "analytics") return { analytics: true };
  if (raw === "necessary") return { analytics: false };
  return null;
}

export function writeConsent(consent: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${consent.analytics ? "analytics" : "necessary"}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
}

export function hasGlobalPrivacyControl(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function analyticsAllowed(): boolean {
  return readConsent()?.analytics === true;
}
