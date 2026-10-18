"use client";

import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { friendlyAuthError, validateEmail } from "@/lib/validation";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateEmail(email);
    setError(found); setFormError(null);
    if (found) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    setPending(false);
    // Rate limit errors are shown. Unknown emails get the same message as known ones.
    if (err && /rate|too many|security purposes/i.test(err.message)) { setFormError(friendlyAuthError(err.message)); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <FormAlert kind="success">
        <p>If an account exists for that email, a reset link is on its way. The link works once and expires in one hour.</p>
      </FormAlert>
    );
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      {formError && <FormAlert kind="error">{formError}</FormAlert>}
      <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} error={error} required />
      <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>{pending ? "Sending link" : "Send reset link"}</button>
    </form>
  );
}
