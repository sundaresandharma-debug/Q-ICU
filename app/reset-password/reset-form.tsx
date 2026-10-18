"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PASSWORD_MIN, friendlyAuthError, validatePassword } from "@/lib/validation";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = { password: validatePassword(password), confirm: confirm === password ? null : "The two passwords do not match." };
    setErrors(found); setFormError(null);
    if (found.password || found.confirm) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setFormError(friendlyAuthError(error.message)); setPending(false); return; }
    // Sign out everywhere so the new password is needed on every device.
    await supabase.auth.signOut({ scope: "global" });
    router.replace("/login?reset=1");
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      {formError && <FormAlert kind="error">{formError}</FormAlert>}
      <Field label="New password" name="password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`} value={password} onChange={e => setPassword(e.target.value)} error={errors.password} required />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} required />
      <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>{pending ? "Saving" : "Save new password"}</button>
    </form>
  );
}
