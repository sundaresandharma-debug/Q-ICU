"use client";

import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string | null; hint?: string };

/** Labelled input with hint and inline error wired up for screen readers. */
export function Field({ label, name, error, hint, id, ...rest }: Props) {
  const fieldId = id ?? `field-${name}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      <input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}

export function FormAlert({ kind, children }: { kind: "error" | "info" | "success"; children: React.ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}
