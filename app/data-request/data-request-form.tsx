"use client";

import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { validateEmail } from "@/lib/validation";

type Errors = Partial<Record<"email" | "type" | "consent", string | null>>;

export function DataRequestForm() {
  const [email, setEmail] = useState("");
  const [type, setType] = useState("");
  const [details, setDetails] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      email: validateEmail(email),
      type: type ? null : "Choose what you would like us to do.",
      consent: consent ? null : "We need your permission to use your email for this request.",
    };
    setErrors(found); setFormError(null);
    if (Object.values(found).some(Boolean)) return;
    setPending(true);
    try {
      const res = await fetch("/api/data-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, type, details, consent }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors(data.fields ?? {}); throw new Error(data.error ?? "We could not send your request."); }
      setDone(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "We could not send your request.");
    } finally { setPending(false); }
  }

  if (done) return <FormAlert kind="success"><p>Request received. We will reply to {email} within 30 days.</p></FormAlert>;

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      {formError && <FormAlert kind="error">{formError}</FormAlert>}
      <Field label="Your email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} error={errors.email} required />
      <div className="field">
        <label htmlFor="type">What would you like us to do?</label>
        <select id="type" className="select" value={type} onChange={e => setType(e.target.value)} aria-invalid={errors.type ? true : undefined} aria-describedby={errors.type ? "type-error" : undefined}>
          <option value="">Choose one</option>
          <option value="deletion">Delete my data</option>
          <option value="access">Send me a copy of my data</option>
          <option value="correction">Correct my data</option>
        </select>
        {errors.type && <p id="type-error" className="field-error">{errors.type}</p>}
      </div>
      <div className="field">
        <label htmlFor="details">Details (optional)</label>
        <p id="details-hint" className="field-hint">Do not include passwords or health information.</p>
        <textarea id="details" maxLength={2000} value={details} onChange={e => setDetails(e.target.value)} aria-describedby="details-hint" />
      </div>
      <div className="field">
        <div className="check">
          <input id="consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? "consent-error" : undefined} />
          <label htmlFor="consent">Use my email address to handle this request. It is deleted one year after the request is closed.</label>
        </div>
        {errors.consent && <p id="consent-error" className="field-error">{errors.consent}</p>}
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>{pending ? "Sending" : "Send request"}</button></div>
    </form>
  );
}
