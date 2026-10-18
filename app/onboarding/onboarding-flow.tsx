"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { validateDisplayName } from "@/lib/validation";

const STEPS = ["Your name", "Data rules", "Start"];

export function OnboardingFlow({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function nextFromName(e: FormEvent) {
    e.preventDefault();
    const err = validateDisplayName(name);
    setNameError(err);
    if (!err) setStep(1);
  }

  function nextFromRules(e: FormEvent) {
    e.preventDefault();
    setAgreeError(agreed ? null : "Confirm this to continue. Q-ICU must never hold identifiable patient data.");
    if (agreed) setStep(2);
  }

  async function finish() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true); setFormError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace("/login?next=/onboarding"); return; }
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim() || null, onboarded_at: new Date().toISOString() })
      .eq("id", auth.user.id);
    if (error) { setFormError("We could not save your settings. Check your connection and try again."); setPending(false); return; }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <>
      <p className="meta">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      <ol className="progress" aria-hidden="true">{STEPS.map((s, i) => <li key={s} data-done={i <= step} />)}</ol>

      {step === 0 && (
        <form className="form-stack" onSubmit={nextFromName} noValidate>
          <h1>What should we call you?</h1>
          <Field label="Display name (optional)" name="display_name" autoComplete="nickname" hint="Shown only to you, in your account page. Leave it blank if you prefer." value={name} onChange={e => setName(e.target.value)} error={nameError} maxLength={60} />
          <div className="btn-row"><button type="submit" className="btn btn-primary">Continue</button></div>
        </form>
      )}

      {step === 1 && (
        <form className="form-stack" onSubmit={nextFromRules} noValidate>
          <h1>Use synthetic data only</h1>
          <p>Q-ICU is a research prototype. Scenarios you save are stored in our database, so they must not identify anyone.</p>
          <ul>
            <li>Use made-up IDs such as P001. Names, emails and record numbers are rejected.</li>
            <li>Do not enter dates of birth, addresses or free-text notes about real people.</li>
            <li>This applies to children in particular. Never upload data about real minors.</li>
          </ul>
          <div className="field">
            <div className="check">
              <input id="agree" type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} aria-invalid={agreeError ? true : undefined} aria-describedby={agreeError ? "agree-error" : undefined} />
              <label htmlFor="agree">I will only enter synthetic or fully de-identified records.</label>
            </div>
            {agreeError && <p id="agree-error" className="field-error">{agreeError}</p>}
          </div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
            <button type="submit" className="btn btn-primary">Continue</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="form-stack">
          <h1>You are set up</h1>
          <p>Your dashboard opens with a 10-patient demo scenario. From there you can:</p>
          <ol>
            <li>Change the bed, ventilator and nurse counts.</li>
            <li>Press <strong>Run optimizer</strong> to get a QAOA result and the classical comparison.</li>
            <li>Save the scenario to come back to it later.</li>
          </ol>
          {formError && <FormAlert kind="error">{formError}</FormAlert>}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={finish} disabled={pending} aria-disabled={pending}>{pending ? "Saving" : "Open my dashboard"}</button>
          </div>
        </div>
      )}
    </>
  );
}
