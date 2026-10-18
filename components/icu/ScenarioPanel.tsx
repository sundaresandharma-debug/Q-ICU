"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, FormAlert } from "@/components/Field";
import { SkeletonRows } from "@/components/Skeleton";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { SCENARIO_NAME_MAX } from "@/lib/validation";
import { validatePatients, type Patient, type Resources } from "./model";

type Scenario = { id: string; name: string; patients: Patient[]; resources: Resources; updated_at: string };
type Status = { kind: "error" | "success" | "info"; text: string } | null;

/** Saved scenarios for the signed-in user. Row level security limits every query to their own rows. */
export function ScenarioPanel({ patients, resources, onLoad }: { patients: Patient[]; resources: Resources; onLoad: (s: Scenario) => void }) {
  const [items, setItems] = useState<Scenario[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) { setLoadError("Saving is not available on this deployment."); setItems([]); return; }
    setLoadError(null);
    const { data, error } = await supabase.from("scenarios").select("id, name, patients, resources, updated_at").order("updated_at", { ascending: false });
    if (error) { setLoadError("We could not load your saved scenarios. Check your connection, then reload the page."); setItems([]); return; }
    setItems(data as Scenario[]);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setNameError("Give the scenario a name, such as Night shift."); return; }
    if (trimmed.length > SCENARIO_NAME_MAX) { setNameError(`Use ${SCENARIO_NAME_MAX} characters or fewer.`); return; }
    if (!patients.length) { setNameError("Add at least one patient before saving."); return; }
    setNameError(null); setSaving(true); setStatus(null);
    const supabase = getBrowserSupabase();
    const { error } = await supabase!.from("scenarios").insert({ name: trimmed, patients, resources });
    setSaving(false);
    if (error) {
      setStatus({ kind: "error", text: error.message.includes("SCENARIO_LIMIT_REACHED") ? "You have 50 saved scenarios, which is the limit. Delete one to save a new one." : "We could not save the scenario. Try again." });
      return;
    }
    setName(""); setStatus({ kind: "success", text: `Saved "${trimmed}".` });
    refresh();
  }

  async function remove(s: Scenario) {
    const supabase = getBrowserSupabase();
    const { error } = await supabase!.from("scenarios").delete().eq("id", s.id);
    setConfirmDelete(null);
    if (error) { setStatus({ kind: "error", text: `We could not delete "${s.name}". Try again.` }); return; }
    setStatus({ kind: "info", text: `Deleted "${s.name}".` });
    refresh();
  }

  function load(s: Scenario) {
    try { validatePatients(s.patients); onLoad(s); }
    catch (err) { setStatus({ kind: "error", text: `"${s.name}" could not be loaded. ${err instanceof Error ? err.message : ""}` }); }
  }

  return (
    <section className="rail-block" aria-labelledby="saved-title" aria-busy={items === null}>
      <h2 id="saved-title" className="block-title">Saved scenarios</h2><p className="meta">Only you can see these.</p>
      <form className="inline-form" onSubmit={save} noValidate>
        <Field label="Save current setup as" name="scenario_name" placeholder="Night shift, ward B" maxLength={SCENARIO_NAME_MAX} value={name} onChange={e => setName(e.target.value)} error={nameError} />
        <button type="submit" className="btn" disabled={saving}>{saving ? "Saving" : "Save scenario"}</button>
      </form>
      <div aria-live="polite" style={{ margin: "12px 0" }}>{status && <FormAlert kind={status.kind}>{status.text}</FormAlert>}</div>

      {items === null ? (
        <><p className="visually-hidden" role="status">Loading saved scenarios</p><SkeletonRows rows={3} /></>
      ) : loadError ? (
        <FormAlert kind="error">{loadError}</FormAlert>
      ) : items.length === 0 ? (
        <div className="empty">
          <h3>No saved scenarios</h3>
          <p>Set up patients and resource counts below, give them a name above and press Save scenario. They will be listed here.</p>
        </div>
      ) : (
        <ul className="saved-list">
          {items.map(s => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className="meta">{s.patients.length} patients, {s.resources.beds} beds, {s.resources.ventilators} ventilators, {s.resources.nurses} nurses. Saved {new Date(s.updated_at).toLocaleString("en-GB")}</span>
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn-small" onClick={() => load(s)} aria-label={`Load ${s.name}`}>Load</button>
                {confirmDelete === s.id ? (
                  <>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => remove(s)}>Confirm delete</button>
                    <button type="button" className="btn btn-small" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-small" onClick={() => setConfirmDelete(s.id)} aria-label={`Delete ${s.name}`}>Delete</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
