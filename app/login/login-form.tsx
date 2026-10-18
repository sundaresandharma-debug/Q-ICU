"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { friendlyAuthError, validateEmail } from "@/lib/validation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next_errors = { email: validateEmail(email), password: password ? null : "Enter your password." };
    setErrors(next_errors);
    setFormError(null);
    if (next_errors.email || next_errors.password) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setFormError(friendlyAuthError(error.message)); setPending(false); return; }
    router.replace(next);
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      {formError && <FormAlert kind="error">{formError}</FormAlert>}
      <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} error={errors.email} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} error={errors.password} required />
      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>{pending ? "Signing in" : "Sign in"}</button>
        <Link href="/forgot-password">Forgot your password?</Link>
      </div>
      <p className="visually-hidden" role="status">{pending ? "Signing in, please wait." : ""}</p>
    </form>
  );
}
