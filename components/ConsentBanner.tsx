"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OPEN_SETTINGS_EVENT, hasGlobalPrivacyControl, readConsent, writeConsent } from "@/lib/consent";

/**
 * Shown until the visitor chooses. Both choices carry equal weight and
 * nothing is pre-selected. Analytics stays off until "Allow analytics".
 * It does not grab focus, so the skip link stays the first tab stop; it is
 * announced as a labelled region and reached by Tab at the end of the page.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!readConsent()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, []);

  if (!open) return null;
  const choose = (analytics: boolean) => { writeConsent({ analytics }); setOpen(false); };

  return (
    <section className="consent" role="region" aria-labelledby="consent-title">
      <div className="wrap consent-inner">
        <div>
          <h2 id="consent-title" className="consent-title">Cookies on Q-ICU</h2>
          <p>
            We use one cookie to keep you signed in and one to remember this choice. With your permission we also
            count page visits, without cookies, IP addresses or advertising IDs.
            {hasGlobalPrivacyControl() && " Your browser sends a Global Privacy Control signal, so analytics stays off unless you allow it here."}
            {" "}<Link href="/legal/cookies">Cookie Policy</Link>
          </p>
        </div>
        <div className="consent-actions">
          <button type="button" className="btn" onClick={() => choose(false)}>Necessary only</button>
          <button type="button" className="btn" onClick={() => choose(true)}>Allow analytics</button>
        </div>
      </div>
    </section>
  );
}

export function CookieSettingsButton() {
  return (
    <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>
      Cookie settings
    </button>
  );
}
