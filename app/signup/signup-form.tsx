"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import { PASSWORD_MIN, friendlyAuthError, validateEmail, validatePassword } from "@/lib/validation";

type Errors = Partial<Record<"email" | "password" | "confirm" | "age" | "terms", string | null>>;

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: confirm === password ? null : "The two passwords do not match.",
      age: age ? null : `You must be ${site.minimumAge} or older to create an account.`,
      terms: terms ? null : "You must accept the Terms of Service and Privacy Policy.",
    };
    setErrors(found);
    setFormError(null);
    if (Object.values(found).some(Boolean)) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding`,
        // Recorded on the profile by the database trigger, which also rejects sign-ups without them.
        data: { age_confirmed: true, terms_version: site.termsVersion, privacy_version: site.privacyVersion },
      },
    });
    setPending(false);
    if (error) { setFormError(friendlyAuthError(error.message)); return; }
    if (data.session) { router.replace("/onboarding"); router.refresh(); return; }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <FormAlert kind="success">
        <p>We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account. The link expires in 24 hours.</p>
        <p>No email after a few minutes? Check your spam folder, or <Link href="/signup" onClick={() => setSentTo(null)}>try again</Link>.</p>
      </FormAlert>
    );
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      {formError && <FormAlert kind="error">{formError}</FormAlert>}
      <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} error={errors.email} required />
      <Field label="Password" name="password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`} value={password} onChange={e => setPassword(e.target.value)} error={errors.password} required />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} required />

      <div className="field">
        <div className="check">
          <input id="age" type="checkbox" checked={age} onChange={e => setAge(e.target.checked)} aria-invalid={errors.age ? true : undefined} aria-describedby={errors.age ? "age-error" : undefined} />
          <label htmlFor="age">I am {site.minimumAge} or older.</label>
        </div>
        {errors.age && <p id="age-error" className="field-error">{errors.age}</p>}
      </div>
      <div className="field">
        <div className="check">
          <input id="terms" type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} aria-invalid={errors.terms ? true : undefined} aria-describedby={errors.terms ? "terms-error" : undefined} />
          <label htmlFor="terms">
            I accept the <Link href="/legal/terms" target="_blank">Terms of Service</Link> and have read the <Link href="/legal/privacy" target="_blank">Privacy Policy</Link>.
          </label>
        </div>
        {errors.terms && <p id="terms-error" className="field-error">{errors.terms}</p>}
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>{pending ? "Creating account" : "Create account"}</button>
      <p className="visually-hidden" role="status">{pending ? "Creating your account, please wait." : ""}</p>
    </form>
  );
}
