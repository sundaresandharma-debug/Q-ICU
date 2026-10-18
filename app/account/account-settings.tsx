"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { validateDisplayName } from "@/lib/validation";

export function AccountSettings({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const err = validateDisplayName(name);
    setNameError(err);
    if (err) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setSaveState("saving");
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() || null }).eq("id", auth.user?.id ?? "");
    setSaveState(error ? "error" : "saved");
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    if (confirmText.trim().toLowerCase() !== email.toLowerCase()) {
      setDeleteError("Type your email address exactly as shown to confirm.");
      return;
    }
    setDeleting(true); setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmText.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "We could not delete your account. Try again.");
      await getBrowserSupabase()?.auth.signOut();
      router.replace("/login?deleted=1");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "We could not delete your account. Try again.");
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="section">
        <h2>Profile</h2>
        <form className="inline-form" onSubmit={saveName} noValidate>
          <Field label="Display name" name="display_name" value={name} maxLength={60} onChange={e => { setName(e.target.value); setSaveState("idle"); }} error={nameError} />
          <button type="submit" className="btn" disabled={saveState === "saving"}>{saveState === "saving" ? "Saving" : "Save"}</button>
        </form>
        <div aria-live="polite" style={{ marginTop: 10 }}>
          {saveState === "saved" && <FormAlert kind="success">Display name saved.</FormAlert>}
          {saveState === "error" && <FormAlert kind="error">We could not save your display name. Try again.</FormAlert>}
        </div>
      </section>

      <section className="section">
        <h2>Your data</h2>
        <p>Download everything we hold about your account as a JSON file: your profile, consent record and saved scenarios.</p>
        <a className="btn" href="/api/account/export" download>Download my data</a>
      </section>

      <section className="section">
        <div className="danger-zone">
          <h2>Delete account</h2>
          <p>This permanently deletes your account, profile and every saved scenario straight away. It cannot be undone. Backups that still contain your data are overwritten within 30 days.</p>
          <form className="form-stack" onSubmit={deleteAccount} noValidate>
            {deleteError && <FormAlert kind="error">{deleteError}</FormAlert>}
            <Field label={`Type ${email} to confirm`} name="confirm_delete" autoComplete="off" value={confirmText} onChange={e => setConfirmText(e.target.value)} />
            <div><button type="submit" className="btn btn-danger" disabled={deleting} aria-disabled={deleting}>{deleting ? "Deleting account" : "Delete my account"}</button></div>
          </form>
        </div>
      </section>
    </>
  );
}
