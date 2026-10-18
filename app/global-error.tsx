"use client";

import { useEffect } from "react";
import { reportError } from "@/components/Telemetry";

/** Last-resort boundary when the root layout itself fails. Uses inline styles because globals.css may not load. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, error.digest); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f1ede4", color: "#1c211f", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 16px" }} role="alert">
          <h1 style={{ fontSize: 28 }}>Q-ICU could not load.</h1>
          <p>We have logged the error. Reload the page, and contact us if it keeps happening.</p>
          {error.digest && <p>Reference: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "10px 16px", border: "1px solid #1c211f", background: "#f8f6f0", cursor: "pointer" }}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
