"use client";

import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/Field";
import { Skeleton } from "@/components/Skeleton";
import { AddPatientDialog } from "./AddPatientDialog";
import { ScenarioPanel } from "./ScenarioPanel";
import { CapacityFigure } from "./CapacityFigure";
import {
  CRITICAL_PRIORITY, DEFAULT_RESOURCES, DEMO_PATIENTS, MAX_PATIENTS, SAMPLE_CSV, allocRow, buildPreview,
  capacityOf, clamp, effectiveScore, holds, normalizeKey, parseCSV, planAction, slotOf, toPatient, validatePatients,
  type Patient, type PlanAction, type Prediction, type ResourceName, type Resources, type Result,
} from "./model";

type Message = { kind: "error" | "info" | "success"; text: string } | null;

export function ICUTool({ mode }: { mode: "demo" | "account" }) {
  const [patients, setPatients] = useState<Patient[]>(DEMO_PATIENTS);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [resources, setResources] = useState<Resources>(DEFAULT_RESOURCES);
  const [shots, setShots] = useState(256);
  const [result, setResult] = useState<Result>(() => buildPreview(DEMO_PATIENTS, DEFAULT_RESOURCES, {}));
  const [running, setRunning] = useState(false);
  const [timestep, setTimestep] = useState(12);
  const [source, setSource] = useState("Demo scenario");
  const [message, setMessage] = useState<Message>(null);
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  /** Bumped whenever inputs change, so a slow backend response for old inputs is discarded. */
  const inputVersion = useRef(0);

  useEffect(() => {
    inputVersion.current += 1;
    setPredictions({});
    setResult(buildPreview(patients, resources, {}));
  }, [patients, resources]);

  const metrics = result.metrics;
  const affected = new Set(result.affectedIds);
  const hasPatients = patients.length > 0;

  function loadScenario(next: { name: string; patients: Patient[]; resources: Resources }) {
    setPatients(next.patients); setResources(next.resources); setSource(`Saved: ${next.name}`);
    setMessage({ kind: "success", text: `Loaded "${next.name}" with ${next.patients.length} patients.` });
  }

  function resetDemo() {
    setPatients(DEMO_PATIENTS); setResources(DEFAULT_RESOURCES); setSource("Demo scenario"); setTimestep(12);
    setMessage({ kind: "info", text: "Demo scenario restored." });
  }

  async function importFile(file: File) {
    if (file.size > 512 * 1024) { setMessage({ kind: "error", text: "That file is larger than 512 KB. Import at most 100 patients at a time." }); return; }
    try {
      const text = await file.text(); let rows: Record<string, string>[];
      if (file.name.toLowerCase().endsWith(".json")) {
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error("That JSON file could not be read. Check that it is valid JSON."); }
        const arr = Array.isArray(parsed) ? parsed : (parsed as { patients?: unknown })?.patients;
        if (!Array.isArray(arr)) throw new Error("The JSON file must be a list of patients, or an object with a \"patients\" list.");
        rows = arr.map((x: unknown) => {
          if (!x || typeof x !== "object") throw new Error("Each patient in the JSON file must be an object.");
          return Object.fromEntries(Object.entries(x).map(([k, v]) => [normalizeKey(k), v === null || v === undefined ? "" : String(v)]));
        });
      } else rows = parseCSV(text);
      const loaded = rows.map((r, i) => toPatient(r, i)); validatePatients(loaded);
      setPatients(loaded); setSource(`Imported: ${file.name}`);
      setMessage({ kind: "success", text: `${loaded.length} patients loaded from ${file.name}. Check them below, then run the optimizer.` });
    } catch (e) { setMessage({ kind: "error", text: e instanceof Error ? e.message : "That file could not be imported." }); }
  }

  function addPatient(p: Patient) {
    setPatients(ps => [...ps, p]); setSource("Manual entry"); setMessage({ kind: "success", text: `${p.id} added.` });
  }

  function removePatient(id: string) {
    setPatients(ps => ps.filter(p => p.id !== id)); setMessage({ kind: "info", text: `${id} removed.` });
  }

  async function optimize() {
    if (!hasPatients) { setMessage({ kind: "error", text: "Add or import at least one patient first." }); return; }
    const version = inputVersion.current;
    setRunning(true); setMessage(null);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patients, ...resources, qaoa_reps: 1, shots }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 503 || response.status === 502) {
          setMessage({ kind: "info", text: `${data?.error ?? "The optimizer is offline."} Showing the browser estimate instead. It is not a QAOA result.` });
          return;
        }
        const detail = Array.isArray(data?.detail)
          ? data.detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ")
          : data?.error ?? data?.detail ?? response.statusText;
        throw new Error(response.status === 429 ? detail : `The optimizer rejected the request: ${detail}`);
      }
      if (version !== inputVersion.current) { setMessage({ kind: "info", text: "The inputs changed while the optimizer was running. Run it again to see results for the new inputs." }); return; }

      const r = data.bottleneck as ResourceName;
      const preds: Record<string, Prediction> = {};
      for (const p of patients) preds[p.id] = { vent: data.predictions[p.id], priority: data.priorities[p.id] };
      const locked = new Set<string>(data.lockedPatients ?? []);
      const m = data.metrics;
      const q = data.quantum?.parameters;
      setPredictions(preds);
      setResult({
        measured: true,
        bottleneck: r,
        bottleneckReason: data.bottleneckReason,
        pressure: data.pressures[r],
        demand: data.demand,
        affectedIds: data.affectedPatients.map((p: Patient) => p.id),
        baseline: data.allocations.fullBaseline.map((x: { patient: string; resource: string }) => allocRow(x.patient, x.resource, r, "Classical baseline")),
        proposed: data.allocations.pbaQaoa.map((x: { patient: string; resource: string }) => allocRow(x.patient, x.resource, r, locked.has(x.patient) ? "Kept (unaffected)" : "QAOA")),
        metrics: {
          fullQuboVars: m.fullQuboVars, reducedQuboVars: m.reducedQuboVars,
          runtimeFull: m.fullRuntimeMs, runtimeProposed: m.qaoaRuntimeMs,
          criticalTotal: m.criticalTotal,
          criticalServedFull: m.criticalServedFull, criticalServedProposed: m.criticalServedProposed,
          utilizationFull: m.utilizationFull, utilizationProposed: m.utilizationProposed,
          violationsFull: m.violationsFull, violationsProposed: m.violationsProposed,
          changesFull: m.changesFull, changesProposed: m.changesProposed,
        },
        quantumNote: q?.mode === "qaoa_aer_statevector_and_shots"
          ? `QAOA with p=${data.quantum.reps} and ${data.quantum.shots} shots, gamma ${q.gamma}, beta ${q.beta}. ${q.foundOptimum ? "It reached the exact optimum of the reduced problem." : "It did not reach the exact optimum of the reduced problem."} Baseline method: ${String(m.baselineMethod).replace(/_/g, " ")}.`
          : `The reduced problem was solved classically (${q?.mode ?? "unknown method"}).`,
      });
      setMessage({ kind: "success", text: `Optimization complete. ${r} is the predicted bottleneck.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "The optimizer sent a response we could not read. Try again." });
    } finally { setRunning(false); }
  }

  function simulateNextStep() {
    const jitter = (spread: number, bias: number) => Math.round((Math.random() - bias) * spread);
    setPatients(ps => ps.map(p => ({
      ...p,
      severity: clamp(p.severity + jitter(12, 0.42), 20, 99),
      spo2: clamp(p.spo2 + jitter(4, 0.5), 78, 99),
      hr: clamp(p.hr + jitter(10, 0.45), 65, 145),
      rr: clamp(p.rr + jitter(4, 0.45), 10, 40),
      ventilatorNeed: p.ventilatorNeed === undefined ? undefined : clamp(p.ventilatorNeed + jitter(12, 0.45), 5, 99),
    })));
    setTimestep(t => t + 1);
    setMessage({ kind: "info", text: "Vitals moved one timestep. The estimate is updated. Run the optimizer for measured results." });
  }

  function downloadSample() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    a.download = "q-icu-sample-patients.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const capacity = capacityOf(resources);
  const r = result.bottleneck;
  const short = result.demand[r] > capacity[r];
  const headline = !hasPatients
    ? "No patients loaded."
    : short ? `${r} run out first.` : "No shortage predicted.";
  const subline = !hasPatients
    ? "Import a file, add a patient or restore the demo to see a plan."
    : short
      ? `${result.demand[r]} patients need ${articleFor(r)}, ${capacity[r]} ${capacity[r] === 1 ? "is" : "are"} available.`
      : `${r} are the tightest: ${result.demand[r]} needed of ${capacity[r]}.`;

  return (
    <div className="wrap chart">
      <header className="chart-head">
        <p className="eyebrow">
          {mode === "account" && <>Dashboard <span aria-hidden="true">/</span> </>}Timestep {timestep} <span aria-hidden="true">/</span> {source}
        </p>
        <span className={`badge ${result.measured ? "badge-live" : ""}`}>{result.measured ? "Measured run" : "Browser estimate"}</span>
      </header>

      <div className="chart-grid">
        <div className="chart-main">
          <section aria-labelledby="headline" aria-busy={running} className="verdict">
            <h1 id="headline">{running ? "Running the optimizer" : headline}</h1>
            <p className="verdict-sub">{running ? "This can take up to a minute." : subline}</p>
            <div className="btn-row verdict-actions">
              <button type="button" className="btn btn-primary" onClick={optimize} disabled={running || !hasPatients} aria-disabled={running || !hasPatients}>
                {running ? "Running optimizer" : "Run optimizer"}
              </button>
              <button type="button" className="btn" onClick={simulateNextStep} disabled={running || !hasPatients}>Advance one timestep</button>
            </div>
            <div aria-live="polite" className="verdict-message">
              {message && <FormAlert kind={message.kind}>{message.text}</FormAlert>}
              <p className="visually-hidden" role="status">{running ? "Optimizer running. This can take up to a minute." : ""}</p>
            </div>
          </section>

          <section aria-labelledby="capacity-title" className="block">
            <h2 id="capacity-title" className="block-title">Demand against capacity</h2>
            <CapacityFigure demand={result.demand} capacity={capacity} bottleneck={hasPatients ? r : null} loading={running} />
          </section>

          <section aria-labelledby="plan-title" className="block">
            <div className="block-head">
              <h2 id="plan-title" className="block-title">Plan for {r.toLowerCase()}</h2>
              <p className="meta">{Object.keys(predictions).length ? "Risk from the ML model in the last run" : "Risk is a browser estimate until you run the optimizer"}</p>
            </div>
            {hasPatients ? (
              <div className="table-wrap">
                <table className="data-table plan">
                  <caption>Rows marked QAOA are in the reduced problem. Priority {CRITICAL_PRIORITY} and above is critical. The classical column shows where the full classical solve disagrees.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Patient</th><th scope="col">Age</th><th scope="col">SpO2</th><th scope="col">Vent. risk</th>
                      <th scope="col">Priority</th><th scope="col">Now</th><th scope="col">QAOA plan</th><th scope="col">Classical</th>
                      <th scope="col"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map(p => {
                      const sc = effectiveScore(p, predictions[p.id]);
                      const inReduced = affected.has(p.id);
                      const slot = slotOf(result.proposed, p.id, r);
                      const action = planAction(holds(p, r), slot, inReduced);
                      const classical = planAction(holds(p, r), slotOf(result.baseline, p.id, r), inReduced);
                      const differs = classical !== action;
                      const critical = sc.priority >= CRITICAL_PRIORITY;
                      return (
                        <tr key={p.id} data-reduced={inReduced}>
                          <th scope="row">{p.id}{inReduced && <span className="tag">QAOA</span>}</th>
                          <td className="num">{p.age}</td>
                          <td className="num">{p.spo2}%</td>
                          <td>{running ? <Skeleton width={80} /> : <Meter value={sc.vent} />}</td>
                          <td className="num">{running ? <Skeleton width={28} /> : <>{Math.round(sc.priority)}{critical && <span className="critical">critical</span>}</>}</td>
                          <td>{p.current}</td>
                          <td>{running ? <Skeleton width={70} /> : <Action action={action} slot={slot} />}</td>
                          <td>{running ? <Skeleton width={60} /> : <span className={differs ? "differs" : "same"}>{differs ? classical : "Same"}</span>}</td>
                          <td><button type="button" className="link-button remove" onClick={() => removePatient(p.id)} aria-label={`Remove patient ${p.id}`}>Remove</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <h3>No patients yet</h3>
                <p>Import a CSV or JSON file, add a patient by hand, or restore the demo scenario.</p>
                <div className="btn-row">
                  <button type="button" className="btn btn-primary" onClick={resetDemo}>Restore demo scenario</button>
                  <button type="button" className="btn" onClick={() => setShowAdd(true)}>Add patient</button>
                </div>
              </div>
            )}
          </section>

          <details className="method-notes">
            <summary>How this plan was made</summary>
            <ol>
              <li><b>Predict.</b> A logistic regression model, trained on synthetic records, scores each patient for ventilator need.</li>
              <li><b>Detect.</b> Demand is divided by capacity for each resource. The highest ratio is the bottleneck.</li>
              <li><b>Reduce.</b> Only patients who need, hold or are high priority for that resource stay in the problem, up to 12. Everyone else keeps what they have.</li>
              <li><b>Optimize.</b> QAOA on Qiskit Aer solves the reduced problem. A classical solver handles the full one for comparison.</li>
            </ol>
            <p>{result.quantumNote ?? "Capacity is enforced as a penalty term in the QUBO. Run the optimizer for a QAOA result."}</p>
          </details>
        </div>

        <aside className="chart-rail" aria-label="Controls and results">
          <section className="rail-block" aria-labelledby="capacity-inputs">
            <h2 id="capacity-inputs" className="block-title">Capacity</h2>
            <div className="rail-fields">
              <NumberSetting label="ICU beds" value={resources.beds} onChange={beds => setResources(x => ({ ...x, beds }))} />
              <NumberSetting label="Ventilators" value={resources.ventilators} onChange={ventilators => setResources(x => ({ ...x, ventilators }))} />
              <NumberSetting label="Nurses" value={resources.nurses} onChange={nurses => setResources(x => ({ ...x, nurses }))} />
              <NumberSetting label="QAOA shots" value={shots} min={32} max={4096} onChange={setShots} />
            </div>
          </section>

          <section className="rail-block" aria-labelledby="compare-title" aria-busy={running}>
            <h2 id="compare-title" className="block-title">Classical against QAOA</h2>
            <table className="ledger">
              <thead><tr><th scope="col"><span className="visually-hidden">Measure</span></th><th scope="col">Classical</th><th scope="col">QAOA</th></tr></thead>
              <tbody>
                <LedgerRow label="Problem size" a={metrics.fullQuboVars} b={metrics.reducedQuboVars} loading={running} />
                <LedgerRow label={`Critical served of ${metrics.criticalTotal}`} a={metrics.criticalServedFull} b={metrics.criticalServedProposed} loading={running} />
                <LedgerRow label="Resource use" a={metrics.utilizationFull} b={metrics.utilizationProposed} suffix="%" loading={running} />
                <LedgerRow label="Violations" a={metrics.violationsFull} b={metrics.violationsProposed} loading={running} />
                <LedgerRow label="Changes" a={metrics.changesFull} b={metrics.changesProposed} loading={running} />
                <LedgerRow label="Runtime (ms)" a={metrics.runtimeFull} b={metrics.runtimeProposed} loading={running} />
              </tbody>
            </table>
            {!result.measured && <p className="meta">Browser estimate. Runtimes appear after you run the optimizer.</p>}
          </section>

          <section className="rail-block" aria-labelledby="data-title">
            <h2 id="data-title" className="block-title">Patients</h2>
            <div className="rail-actions">
              <button type="button" className="btn btn-wide" onClick={() => fileRef.current?.click()}>Import CSV or JSON</button>
              <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden aria-hidden="true" tabIndex={-1}
                onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = ""; }} />
              <button ref={addButtonRef} type="button" className="btn btn-wide" onClick={() => setShowAdd(true)} disabled={patients.length >= MAX_PATIENTS}>Add patient</button>
              <div className="btn-row">
                <button type="button" className="link-button" onClick={downloadSample}>Sample CSV</button>
                <button type="button" className="link-button" onClick={resetDemo}>Reset demo</button>
              </div>
            </div>
            <p className="meta">Columns: patient_id, age, severity, spo2, heart_rate, respiratory_rate, blood_pressure. Optional: current_state, ventilator_need, priority.</p>
          </section>

          {mode === "account" && <ScenarioPanel patients={patients} resources={resources} onLoad={loadScenario} />}

          <p className="rail-note">Synthetic data only. Not for clinical decisions.</p>
        </aside>
      </div>

      {showAdd && (
        <AddPatientDialog
          existingIds={new Set(patients.map(p => p.id))}
          onAdd={p => { addPatient(p); setShowAdd(false); }}
          onClose={() => { setShowAdd(false); addButtonRef.current?.focus(); }}
        />
      )}
    </div>
  );
}

const articleFor = (r: ResourceName) => (r === "Ventilators" ? "a ventilator" : r === "Beds" ? "a bed" : "a nurse");

/** Number input that lets people type freely and only commits values inside the range. */
function NumberSetting({ label, value, onChange, min = 1, max = 100 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const id = `setting-${label.toLowerCase().replace(/\s+/g, "-")}`;
  useEffect(() => { setText(String(value)); setError(null); }, [value]);
  function commit(raw: string) {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isInteger(n) || n < min || n > max) { setError(`Enter a whole number from ${min} to ${max}.`); return; }
    setError(null);
    if (n !== value) onChange(n);
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} value={text} onChange={e => commit(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  );
}

function Meter({ value }: { value: number }) {
  const v = clamp(Math.round(value), 0, 100);
  return <div className="meter"><span>{v}%</span><div className="meter-track" aria-hidden="true"><div className="meter-fill" style={{ width: `${v}%` }} /></div></div>;
}

function Action({ action, slot }: { action: PlanAction; slot: string | null }) {
  return <span className="action" data-action={action}>{action}{slot && <span className="slot">{slot}</span>}</span>;
}

function LedgerRow({ label, a, b, suffix = "", loading }: { label: string; a: number | null; b: number | null; suffix?: string; loading: boolean }) {
  const show = (v: number | null) => (v === null ? "-" : `${v}${suffix}`);
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="num">{loading ? <Skeleton width={36} /> : show(a)}</td>
      <td className="num">{loading ? <Skeleton width={36} /> : show(b)}</td>
    </tr>
  );
}
