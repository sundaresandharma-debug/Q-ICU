"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Field } from "@/components/Field";
import { STATES, patientErrors, type Patient } from "./model";

const FIELDS: [keyof Form, string, string?][] = [
  ["id", "Patient ID", "A made-up code such as P011"],
  ["age", "Age (years)"],
  ["severity", "Severity (0 to 100)"],
  ["spo2", "SpO2 (%)"],
  ["hr", "Heart rate (bpm)"],
  ["rr", "Respiratory rate (per min)"],
  ["bp", "Systolic blood pressure (mmHg)"],
];
const EMPTY = { id: "", age: "50", severity: "50", spo2: "95", hr: "90", rr: "20", bp: "110", current: "Waiting" };
type Form = typeof EMPTY;

/** Modal dialog: focus moves in on open, Tab stays inside, Escape closes, focus returns to the opener. */
export function AddPatientDialog({ existingIds, onAdd, onClose }: { existingIds: Set<string>; onAdd: (p: Patient) => void; onClose: () => void }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Patient, string>>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = dialogRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]");
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
    const p: Patient = { id: form.id.trim(), age: num(form.age), severity: num(form.severity), spo2: num(form.spo2), hr: num(form.hr), rr: num(form.rr), bp: num(form.bp), current: form.current };
    const found = patientErrors(p, existingIds);
    setErrors(found);
    if (Object.keys(found).length) {
      const firstBad = FIELDS.find(([k]) => found[k as keyof Patient]);
      if (firstBad) dialogRef.current?.querySelector<HTMLInputElement>(`#field-patient-${firstBad[0]}`)?.focus();
      return;
    }
    onAdd(p);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title" aria-describedby="add-desc" onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <h2 id="add-title">Add a patient</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>Close</button>
        </div>
        <p id="add-desc" className="meta">Enter synthetic values. Ventilator risk and priority are worked out by the model when you run the optimizer.</p>
        <form onSubmit={submit} noValidate>
          <div className="dialog-grid">
            {FIELDS.map(([key, label, hint]) => (
              <Field key={key} id={`field-patient-${key}`} name={key} label={label} hint={hint}
                inputMode={key === "id" ? "text" : "decimal"} autoComplete="off" maxLength={key === "id" ? 32 : 6}
                value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} error={errors[key as keyof Patient]} />
            ))}
            <div className="field">
              <label htmlFor="field-patient-current">Current state</label>
              <select id="field-patient-current" className="select" value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))}>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">Add patient</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
