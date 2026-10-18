"use client";

import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/Field";
import { SkeletonRows, Skeleton } from "@/components/Skeleton";
import { AddPatientDialog } from "./AddPatientDialog";
import { ScenarioPanel } from "./ScenarioPanel";
import {
  DEFAULT_RESOURCES, DEMO_PATIENTS, MAX_PATIENTS, SAMPLE_CSV, allocRow, buildPreview, clamp, effectiveScore,
  normalizeKey, parseCSV, toPatient, validatePatients,
  type Allocation, type Patient, type Prediction, type ResourceName, type Resources, type Result,
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

  const ms = (v: number | null) => (v === null ? "Not measured" : `${v} ms`);

  return (
    <div className="wrap tool">
      <div className="tool-head">
        <div>
          <h1>{mode === "account" ? "Dashboard" : "Q-ICU demo"}</h1>
          <p>Timestep {timestep}. {source}. <span className={`badge ${result.measured ? "badge-live" : ""}`}>{result.measured ? "Measured result" : "Browser estimate"}</span></p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={simulateNextStep} disabled={running || !hasPatients}>Next timestep</button>
          <button type="button" className="btn btn-primary" onClick={optimize} disabled={running || !hasPatients} aria-disabled={running || !hasPatients}>
            {running ? "Running optimizer" : "Run optimizer"}
          </button>
        </div>
      </div>
      <p className="notice">Synthetic data only. Do not enter real patient information. This tool is not for clinical decisions.</p>

      <div aria-live="polite" style={{ marginTop: 14 }}>
        {message && <FormAlert kind={message.kind}>{message.text}</FormAlert>}
        <p className="visually-hidden" role="status">{running ? "Optimizer running. This can take up to a minute." : ""}</p>
      </div>

      {mode === "account" && <ScenarioPanel patients={patients} resources={resources} onLoad={loadScenario} />}

      <section className="section" aria-labelledby="inputs-title">
        <div className="section-head">
          <h2 id="inputs-title">Patients and resources</h2>
          <p>Required columns: patient_id, age, severity, spo2, heart_rate, respiratory_rate, blood_pressure. Optional: current_state, ventilator_need, priority.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import CSV or JSON</button>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden aria-hidden="true" tabIndex={-1}
            onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = ""; }} />
          <button ref={addButtonRef} type="button" className="btn" onClick={() => setShowAdd(true)} disabled={patients.length >= MAX_PATIENTS}>Add patient</button>
          <button type="button" className="btn" onClick={downloadSample}>Download sample CSV</button>
          <button type="button" className="btn" onClick={resetDemo}>Reset demo</button>
        </div>
        <div className="resource-grid">
          <NumberSetting label="ICU beds" value={resources.beds} onChange={beds => setResources(r => ({ ...r, beds }))} />
          <NumberSetting label="Ventilators" value={resources.ventilators} onChange={ventilators => setResources(r => ({ ...r, ventilators }))} />
          <NumberSetting label="Nurses" value={resources.nurses} onChange={nurses => setResources(r => ({ ...r, nurses }))} />
          <NumberSetting label="QAOA shots" value={shots} min={32} max={4096} onChange={setShots} />
        </div>
      </section>

      <section className="section" aria-labelledby="summary-title" aria-busy={running}>
        <div className="section-head"><h2 id="summary-title">Summary</h2><p>{result.measured ? "From the last optimizer run" : "Browser estimate until you run the optimizer"}</p></div>
        <dl className="figures">
          <Figure label="Patients" value={patients.length} note={`Timestep ${timestep}`} />
          <Figure label="Predicted bottleneck" value={hasPatients ? result.bottleneck : "None"} note={`${Math.round(result.pressure * 100)}% of capacity`} loading={running} />
          <Figure label="Problem size (reduced / full)" value={`${metrics.reducedQuboVars} / ${metrics.fullQuboVars}`} note="One variable per patient" loading={running} />
          <Figure label="QAOA runtime" value={ms(metrics.runtimeProposed)} note={metrics.runtimeFull === null ? "Run the optimizer to measure" : `Full classical solve: ${metrics.runtimeFull} ms`} loading={running} />
        </dl>
        <div className="pressure">
          <p style={{ margin: "0 0 6px" }}>{result.bottleneckReason}</p>
          <div className="meter" aria-hidden="true"><div className="meter-track"><div className="meter-fill" style={{ width: `${clamp(Math.round(result.pressure * 100), 0, 100)}%` }} /></div></div>
        </div>
      </section>

      <section className="section" aria-labelledby="method-title">
        <div className="section-head"><h2 id="method-title">Method</h2><p>Step two decides which patients reach the quantum step.</p></div>
        <ol className="method">
          <li><span>01</span><b>Predict</b><p>Score each patient for ventilator need.</p></li>
          <li aria-current="step"><span>02</span><b>Detect</b><p>Pick the resource with the highest demand to capacity ratio.</p></li>
          <li><span>03</span><b>Reduce</b><p>Keep only the patients that resource affects.</p></li>
          <li><span>04</span><b>Optimize</b><p>Run QAOA on the reduced problem.</p></li>
        </ol>
        <p className="meta" style={{ marginTop: 12 }}>{result.quantumNote ?? "Capacity is enforced as a penalty term in the QUBO. Run the optimizer for a QAOA result."}</p>
      </section>

      <section className="section" aria-labelledby="patients-title">
        <div className="section-head"><h2 id="patients-title">Patients</h2><p>{Object.keys(predictions).length ? "Ventilator risk from the ML model in the last run" : "Ventilator risk is a browser estimate until you run the optimizer"}</p></div>
        {hasPatients ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption>Patients in bold are in the reduced problem sent to QAOA.</caption>
              <thead><tr><th scope="col">Patient</th><th scope="col">Age</th><th scope="col">Severity</th><th scope="col">SpO2</th><th scope="col">Ventilator risk</th><th scope="col">Priority</th><th scope="col">Current state</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {patients.map(p => {
                  const s = effectiveScore(p, predictions[p.id]);
                  const inReduced = affected.has(p.id);
                  return (
                    <tr key={p.id} data-affected={inReduced}>
                      <th scope="row">{p.id}{inReduced && <span className="tag">reduced</span>}</th>
                      <td className="num">{p.age}</td>
                      <td><Meter value={p.severity} /></td>
                      <td className="num">{p.spo2}%</td>
                      <td>{running ? <Skeleton width={90} /> : <Meter value={s.vent} suffix="%" />}</td>
                      <td>{running ? <Skeleton width={90} /> : <Meter value={s.priority} />}</td>
                      <td>{p.current}</td>
                      <td><button type="button" className="btn btn-small" onClick={() => removePatient(p.id)} aria-label={`Remove patient ${p.id}`}>Remove</button></td>
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

      <section className="section compare" aria-label="Results" aria-busy={running}>
        <div>
          <div className="section-head"><h2>Allocation</h2><p>{result.measured ? "Classical full problem against QAOA on the reduced problem" : "Greedy estimate in the browser"}</p></div>
          <div className="alloc">
            <AllocationTable title="Classical, full problem" data={result.baseline} loading={running} />
            <AllocationTable title="QAOA, reduced problem" data={result.proposed} loading={running} />
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Comparison</h2><p>{result.measured ? "Measured in this run" : "Runtimes need the optimizer"}</p></div>
          {running ? <SkeletonRows rows={5} /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th scope="col">Measure</th><th scope="col">Classical</th><th scope="col">QAOA</th></tr></thead>
                <tbody>
                  <MetricRow label={`Critical patients served (of ${metrics.criticalTotal})`} a={metrics.criticalServedFull} b={metrics.criticalServedProposed} />
                  <MetricRow label="Resource use" a={metrics.utilizationFull} b={metrics.utilizationProposed} suffix="%" />
                  <MetricRow label="Constraint violations" a={metrics.violationsFull} b={metrics.violationsProposed} />
                  <MetricRow label="Allocation changes" a={metrics.changesFull} b={metrics.changesProposed} />
                  <MetricRow label="Runtime" a={metrics.runtimeFull} b={metrics.runtimeProposed} suffix=" ms" />
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

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

function Figure({ label, value, note, loading = false }: { label: string; value: React.ReactNode; note: string; loading?: boolean }) {
  return (
    <div className="figure">
      <dt>{label}</dt>
      <dd>{loading ? <Skeleton width="60%" height={28} /> : value}</dd>
      <p className="figure-note">{note}</p>
    </div>
  );
}

function Meter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const v = clamp(Math.round(value), 0, 100);
  return <div className="meter"><span>{v}{suffix}</span><div className="meter-track" aria-hidden="true"><div className="meter-fill" style={{ width: `${v}%` }} /></div></div>;
}

function AllocationTable({ title, data, loading }: { title: string; data: Allocation[]; loading: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Patient</th><th scope="col">Bed</th><th scope="col">Vent.</th><th scope="col">Nurse</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5}><SkeletonRows rows={4} /></td></tr>
          ) : data.length ? data.map((x, i) => (
            <tr key={`${x.patient}-${i}`}><td>{x.patient}</td><td className="num">{x.bed}</td><td className="num">{x.ventilator}</td><td className="num">{x.nurse}</td><td>{x.status}</td></tr>
          )) : (
            <tr><td colSpan={5}>No allocations. Add patients or raise capacity.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricRow({ label, a, b, suffix = "" }: { label: string; a: number | null; b: number | null; suffix?: string }) {
  const show = (v: number | null) => (v === null ? "Not measured" : `${v}${suffix}`);
  return <tr><td>{label}</td><td className="num">{show(a)}</td><td className="num">{show(b)}</td></tr>;
}
