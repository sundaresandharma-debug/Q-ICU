"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/components/Telemetry";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, error.digest); }, [error]);
  return (
    <div className="wrap not-found" role="alert">
      <p className="code">Something went wrong</p>
      <h1>This page hit an error.</h1>
      <p>We have logged it so we can fix it. Your saved data is safe. Try again, or go back to the home page.</p>
      {error.digest && <p className="meta">Reference: <span className="mono">{error.digest}</span></p>}
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn">Home page</Link>
      </div>
    </div>
  );
}
