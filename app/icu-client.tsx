"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, BrainCircuit, ChevronRight, Cpu, Download, FileUp, Gauge,
  HeartPulse, Layers3, Plus, RefreshCw, ShieldCheck, Sparkles, Stethoscope,
  Timer, Trash2, Users, X, Zap
} from "lucide-react";

// ---------- Types ----------

type Patient = {
  id: string; age: number; severity: number; spo2: number; hr: number; rr: number; bp: number;
  /** Only set when the user/import supplied it. Never overwritten by model output. */
  ventilatorNeed?: number;
  /** Only set when the user/import supplied it. Never overwritten by model output. */
  priority?: number;
  current: string;
};

/** Model output from the last backend run, kept apart from user-entered data. */
type Prediction = { vent: number; priority: number };

type Resources = { beds: number; ventilators: number; nurses: number };
type ResourceName = "Ventilators" | "Beds" | "Nurses";

type Allocation = { patient: string; bed: string; ventilator: string; nurse: string; status: string };

type Metrics = {
  fullQuboVars: number; reducedQuboVars: number;
  runtimeFull: number | null; runtimeProposed: number | null;
  criticalTotal: number; criticalServedFull: number; criticalServedProposed: number;
  utilizationFull: number; utilizationProposed: number;
  violationsFull: number; violationsProposed: number;
  changesFull: number; changesProposed: number;
};

type Result = {
  /** true = numbers came from the Python/Qiskit backend; false = browser preview estimate. */
  measured: boolean;
  bottleneck: ResourceName; bottleneckReason: string; pressure: number;
  affectedIds: string[];
  baseline: Allocation[]; proposed: Allocation[];
  metrics: Metrics;
  quantumNote?: string;
};

// ---------- Constants (kept in sync with backend/engine.py) ----------

const VENT_THRESHOLD = 50, BED_SEVERITY = 45, NURSE_SEVERITY = 40;
const HIGH_PRIORITY = 80, CRITICAL_PRIORITY = 85, MAX_QAOA_VARS = 12;
const KEYWORD: Record<ResourceName, string> = { Ventilators: "ventilator", Beds: "bed", Nurses: "nurse" };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SAMPLE_CSV = `patient_id,age,severity,spo2,heart_rate,respiratory_rate,blood_pressure,current_state
P001,67,92,84,126,31,84,Waiting
P002,54,76,89,112,27,96,Ventilator
P003,71,64,93,102,23,108,Bed + Nurse
P004,43,48,95,94,20,116,Stable
P005,59,87,86,118,29,91,Waiting
P006,32,37,97,88,18,121,Stable
P007,78,69,91,109,25,99,Bed + Nurse
P008,61,58,94,97,21,111,Waiting
P009,49,81,88,115,28,93,Waiting
P010,36,29,98,78,15,124,Stable`;

const EMPTY_FORM = { id: "", age: "50", severity: "50", spo2: "95", hr: "90", rr: "20", bp: "110", current: "Waiting" };
type PatientForm = typeof EMPTY_FORM;

// ---------- Scoring (browser preview only) ----------

/** Effective vent risk + priority: user value, else last backend prediction, else a rough browser heuristic. */
function effectiveScore(p: Patient, pred?: Prediction) {
  const heuristicVent = (p.severity + (100 - p.spo2)) / 2;
  const vent = p.ventilatorNeed ?? pred?.vent ?? heuristicVent;
  const priority = p.priority ?? pred?.priority ?? Math.min(99, Math.round(0.72 * p.severity + 0.28 * vent));
  return { vent, priority };
}

const holds = (p: Patient, r: ResourceName) => p.current.toLowerCase().includes(KEYWORD[r]);

function needs(p: Patient & { vent: number }, r: ResourceName) {
  if (r === "Ventilators") return p.vent >= VENT_THRESHOLD;
  if (r === "Beds") return p.severity >= BED_SEVERITY;
  return p.severity >= NURSE_SEVERITY;
}

function allocRow(patient: string, slot: string, r: ResourceName, status: string): Allocation {
  return {
    patient, status,
    bed: r === "Beds" ? slot : "—",
    ventilator: r === "Ventilators" ? slot : "—",
    nurse: r === "Nurses" ? slot : "—",
  };
}

function scoreAllocation(chosen: string[], slots: string[], patients: (Patient & { priority: number })[], capacity: number, r: ResourceName) {
  const set = new Set(chosen);
  const critical = patients.filter(p => p.priority >= CRITICAL_PRIORITY);
  return {
    critical: critical.filter(p => set.has(p.id)).length,
    criticalTotal: critical.length,
    utilization: Math.round((1000 * Math.min(set.size, capacity)) / Math.max(1, capacity)) / 10,
    violations: Math.max(0, set.size - capacity) + (chosen.length - set.size) + (slots.length - new Set(slots).size),
    changes: patients.filter(p => holds(p, r) !== set.has(p.id)).length,
  };
}

/**
 * Browser-only preview. Mirrors the backend's rules with a heuristic risk score
 * and greedy selection. Runtimes are not measured, so they are null.
 */
function buildPreview(patients: Patient[], res: Resources, preds: Record<string, Prediction>): Result {
  const scored = patients.map(p => ({ ...p, ...effectiveScore(p, preds[p.id]) }));
  const caps: Record<ResourceName, number> = { Ventilators: res.ventilators, Beds: res.beds, Nurses: res.nurses };
  const ranked = (Object.keys(caps) as ResourceName[])
    .map(name => {
      const demand = scored.filter(p => needs(p, name)).length;
      return { name, demand, capacity: caps[name], ratio: demand / Math.max(1, caps[name]) };
    })
    .sort((a, b) => b.ratio - a.ratio);
  const bn = ranked[0];
  const r = bn.name, cap = bn.capacity;
  const reward = (p: (typeof scored)[number]) =>
    0.65 * p.priority + 0.35 * (r === "Ventilators" ? p.vent : p.severity) - (holds(p, r) ? 0 : 20);

  const affected = scored
    .filter(p => needs(p, r) || p.priority >= HIGH_PRIORITY || holds(p, r))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_QAOA_VARS);
  const affectedIds = new Set(affected.map(p => p.id));
  const locked = scored.filter(p => !affectedIds.has(p.id) && holds(p, r)).map(p => p.id);
  const free = Math.max(0, cap - locked.length);

  const fullChosen = [...scored].sort((a, b) => reward(b) - reward(a)).slice(0, cap).map(p => p.id);
  const propChosen = [...locked, ...[...affected].sort((a, b) => reward(b) - reward(a)).slice(0, free).map(p => p.id)];
  const slot = (i: number) => `${r[0]}${i + 1}`;
  const full = scoreAllocation(fullChosen, fullChosen.map((_, i) => slot(i)), scored, cap, r);
  const prop = scoreAllocation(propChosen, propChosen.map((_, i) => slot(i)), scored, cap, r);

  return {
    measured: false,
    bottleneck: r,
    pressure: bn.ratio,
    bottleneckReason: patients.length
      ? `${bn.demand} predicted demand vs ${cap} available (${bn.ratio.toFixed(2)}× capacity, browser estimate).`
      : "Add or import patients to begin.",
    affectedIds: affected.map(p => p.id),
    baseline: fullChosen.map((id, i) => allocRow(id, slot(i), r, "Greedy preview")),
    proposed: propChosen.map((id, i) => allocRow(id, slot(i), r, locked.includes(id) ? "Kept (unaffected)" : "Greedy preview")),
    metrics: {
      fullQuboVars: patients.length, reducedQuboVars: affected.length,
      runtimeFull: null, runtimeProposed: null,
      criticalTotal: full.criticalTotal,
      criticalServedFull: full.critical, criticalServedProposed: prop.critical,
      utilizationFull: full.utilization, utilizationProposed: prop.utilization,
      violationsFull: full.violations, violationsProposed: prop.violations,
      changesFull: full.changes, changesProposed: prop.changes,
    },
  };
}

// ---------- Import ----------

function normalizeKey(key: string) { return key.trim().toLowerCase().replace(/[\s-]+/g, "_"); }

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = "";
    }
    else cell += c;
  }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeKey);
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** [field, column name shown in errors, accepted aliases] */
const REQUIRED: [keyof Patient, string, string[]][] = [
  ["age", "age", ["age"]], ["severity", "severity", ["severity"]], ["spo2", "spo2", ["spo2", "oxygen_saturation"]],
  ["hr", "heart_rate", ["hr", "heart_rate"]], ["rr", "respiratory_rate", ["rr", "respiratory_rate"]], ["bp", "blood_pressure", ["bp", "blood_pressure"]],
];

function toPatient(row: Record<string, string>, index: number): Patient {
  const get = (...keys: string[]) => { for (const k of keys) { const v = row[normalizeKey(k)]; if (v !== undefined && v !== "") return v; } return ""; };
  const id = get("patient_id", "id") || `P${String(index + 1).padStart(3, "0")}`;
  const values: Record<string, number> = {};
  for (const [field, column, aliases] of REQUIRED) {
    const raw = get(...aliases);
    const x = Number(raw);
    if (raw === "" || !Number.isFinite(x)) throw new Error(`Row ${index + 2} (${id}): missing or non-numeric "${column}".`);
    values[field] = x;
  }
  const p: Patient = {
    id, age: values.age, severity: values.severity, spo2: values.spo2, hr: values.hr, rr: values.rr, bp: values.bp,
    current: get("current_state", "current", "state") || "Waiting",
  };
  const vent = get("ventilator_need", "ventilatorNeed"); const priority = get("priority");
  if (vent !== "") { const v = Number(vent); if (!Number.isFinite(v)) throw new Error(`${id}: ventilator_need is not a number.`); p.ventilatorNeed = v; }
  if (priority !== "") { const v = Number(priority); if (!Number.isFinite(v)) throw new Error(`${id}: priority is not a number.`); p.priority = v; }
  return p;
}

function validatePatients(patients: Patient[]) {
  if (!patients.length) throw new Error("No patient records found.");
  if (patients.length > 100) throw new Error("The backend accepts at most 100 patients per run.");
  const ids = new Set<string>();
  for (const p of patients) {
    if (!p.id.trim()) throw new Error("Every patient needs an ID.");
    if (ids.has(p.id)) throw new Error(`Duplicate patient ID: ${p.id}. Each patient must have a unique ID.`);
    ids.add(p.id);
    if (![p.age, p.severity, p.spo2, p.hr, p.rr, p.bp].every(Number.isFinite)) throw new Error(`Invalid record for ${p.id}. All vitals must be numbers.`);
    if (!Number.isInteger(p.age) || p.age < 0 || p.age > 120) throw new Error(`Age must be a whole number between 0 and 120 for ${p.id}.`);
    if (p.severity < 0 || p.severity > 100 || p.spo2 < 0 || p.spo2 > 100) throw new Error(`Severity/SpO₂ must be between 0 and 100 for ${p.id}.`);
    if (p.hr <= 0 || p.rr <= 0 || p.bp <= 0) throw new Error(`Heart rate, respiratory rate, and blood pressure must be positive for ${p.id}.`);
    for (const [k, v] of [["ventilator_need", p.ventilatorNeed], ["priority", p.priority]] as const)
      if (v !== undefined && (v < 0 || v > 100)) throw new Error(`${k} must be between 0 and 100 for ${p.id}.`);
  }
}

const DEMO_PATIENTS: Patient[] = parseCSV(SAMPLE_CSV).map(toPatient);
const DEFAULT_RESOURCES: Resources = { beds: 8, ventilators: 4, nurses: 7 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- Component ----------

export default function ICUClient() {
  const [patients, setPatients] = useState<Patient[]>(DEMO_PATIENTS);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [beds, setBeds] = useState(DEFAULT_RESOURCES.beds);
  const [ventilators, setVentilators] = useState(DEFAULT_RESOURCES.ventilators);
  const [nurses, setNurses] = useState(DEFAULT_RESOURCES.nurses);
  const [shots, setShots] = useState(256);
  const [result, setResult] = useState<Result>(() => buildPreview(DEMO_PATIENTS, DEFAULT_RESOURCES, {}));
  const [running, setRunning] = useState(false);
  const [timestep, setTimestep] = useState(12);
  const [source, setSource] = useState("Demo scenario");
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Bumped whenever inputs change, so a slow backend response for old inputs is discarded. */
  const inputVersion = useRef(0);

  // Any change to patients or resources invalidates the last measured result.
  useEffect(() => {
    inputVersion.current += 1;
    setPredictions({});
    setResult(buildPreview(patients, { beds, ventilators, nurses }, {}));
  }, [patients, beds, ventilators, nurses]);

  const metrics = result.metrics;
  const affected = new Set(result.affectedIds);

  function resetDemo() {
    setPatients(DEMO_PATIENTS); setBeds(DEFAULT_RESOURCES.beds); setVentilators(DEFAULT_RESOURCES.ventilators);
    setNurses(DEFAULT_RESOURCES.nurses); setSource("Demo scenario"); setMessage(""); setTimestep(12);
  }

  async function importFile(file: File) {
    try {
      const text = await file.text(); let rows: Record<string, string>[];
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text); const arr = Array.isArray(parsed) ? parsed : parsed?.patients;
        if (!Array.isArray(arr)) throw new Error("JSON must contain an array of patient records or a patients array.");
        rows = arr.map((x: unknown) => {
          if (!x || typeof x !== "object") throw new Error("Each JSON patient record must be an object.");
          return Object.fromEntries(Object.entries(x).map(([k, v]) => [normalizeKey(k), v === null || v === undefined ? "" : String(v)]));
        });
      } else rows = parseCSV(text);
      const loaded = rows.map((r, i) => toPatient(r, i)); validatePatients(loaded);
      setPatients(loaded); setSource(`Imported: ${file.name}`);
      setMessage(`${loaded.length} patient records loaded. Review them, then run PBA-QAOA.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not import the file."); }
  }

  /** Returns true when the patient was added, so the modal only closes on success. */
  function addPatient(): boolean {
    try {
      const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
      const p: Patient = {
        id: form.id.trim(), age: num(form.age), severity: num(form.severity), spo2: num(form.spo2),
        hr: num(form.hr), rr: num(form.rr), bp: num(form.bp), current: form.current,
      };
      if (!p.id) throw new Error("Enter a patient ID.");
      if (patients.some(x => x.id === p.id)) throw new Error("Patient ID already exists.");
      validatePatients([...patients, p]);
      setPatients([...patients, p]); setSource("Live / manual entry"); setMessage(`${p.id} added.`); setForm(EMPTY_FORM);
      return true;
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not add patient."); return false; }
  }

  function removePatient(id: string) {
    const next = patients.filter(p => p.id !== id);
    if (!next.length) { setMessage("Keep at least one patient record."); return; }
    setPatients(next); setMessage(`${id} removed.`);
  }

  async function optimize() {
    if (!patients.length) { setMessage("Add or import patients first."); return; }
    const version = inputVersion.current;
    setRunning(true); setMessage("");
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/optimize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patients, beds, ventilators, nurses, qaoa_reps: 1, shots }),
      });
    } catch {
      setRunning(false);
      setMessage(`Backend not reachable at ${API_BASE}. Showing the browser preview: estimates only, not a QAOA run.`);
      return;
    }
    try {
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = Array.isArray(data?.detail)
          ? data.detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ")
          : data?.detail ?? response.statusText;
        throw new Error(`Backend rejected the request (${response.status}): ${detail}`);
      }
      if (version !== inputVersion.current) { setMessage("Inputs changed while the optimizer was running. Run it again."); return; }

      const r = data.bottleneck as ResourceName;
      const preds: Record<string, Prediction> = {};
      for (const p of patients) preds[p.id] = { vent: data.predictions[p.id], priority: data.priorities[p.id] };
      const locked = new Set<string>(data.lockedPatients ?? []);
      const m = data.metrics;
      setPredictions(preds);
      setResult({
        measured: true,
        bottleneck: r,
        bottleneckReason: data.bottleneckReason,
        pressure: data.pressures[r],
        affectedIds: data.affectedPatients.map((p: Patient) => p.id),
        baseline: data.allocations.fullBaseline.map((x: { patient: string; resource: string }) => allocRow(x.patient, x.resource, r, "Classical baseline")),
        proposed: data.allocations.pbaQaoa.map((x: { patient: string; resource: string }) => allocRow(x.patient, x.resource, r, locked.has(x.patient) ? "Kept (unaffected)" : "PBA-QAOA")),
        metrics: {
          fullQuboVars: m.fullQuboVars, reducedQuboVars: m.reducedQuboVars,
          runtimeFull: m.fullRuntimeMs, runtimeProposed: m.qaoaRuntimeMs,
          criticalTotal: m.criticalTotal,
          criticalServedFull: m.criticalServedFull, criticalServedProposed: m.criticalServedProposed,
          utilizationFull: m.utilizationFull, utilizationProposed: m.utilizationProposed,
          violationsFull: m.violationsFull, violationsProposed: m.violationsProposed,
          changesFull: m.changesFull, changesProposed: m.changesProposed,
        },
        quantumNote: data.quantum?.parameters?.mode === "qaoa_aer_statevector_and_shots"
          ? `QAOA p=${data.quantum.reps}, ${data.quantum.shots} shots, γ=${data.quantum.parameters.gamma}, β=${data.quantum.parameters.beta}${data.quantum.parameters.foundOptimum ? " · reached the exact optimum" : " · did not reach the exact optimum"}. Baseline: ${m.baselineMethod.replace(/_/g, " ")}.`
          : `Reduced problem solved classically (${data.quantum?.parameters?.mode ?? "unknown"}).`,
      });
      setMessage(`Optimization complete. ${r} is the predicted bottleneck.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unexpected response from the backend.");
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
    setMessage("Vitals changed. The browser preview is updated; run PBA-QAOA for measured results.");
  }

  function downloadSample() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    a.download = "q-icu-sample-patients.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const fmtMs = (v: number | null) => (v === null ? "—" : `${v} ms`);

  return <main className="page">
    <header className="topbar"><div className="brand"><div className="brand-mark"><HeartPulse size={22}/></div><div><div className="brand-title">Q-ICU</div><div className="brand-subtitle">Predictive Bottleneck-Aware Quantum Optimization</div></div></div><div className="top-actions"><span className="live"><span className="dot"/> {result.measured ? "Measured result" : "Browser preview"}</span><button className="ghost-btn" onClick={simulateNextStep}><RefreshCw size={16}/> Next timestep</button></div></header>

    <section className="hero"><div><div className="eyebrow"><Sparkles size={15}/> Quantum healthcare optimization</div><h1>Dynamic ICU allocation,<br/><span>optimized before the bottleneck hits.</span></h1><p>Q-ICU predicts near-term resource demand, identifies the likely ICU bottleneck, and sends only the affected allocation problem to QAOA instead of re-optimizing everything.</p><div className="hero-buttons"><button className="primary-btn" onClick={optimize} disabled={running}><Zap size={17}/> {running ? "Running QAOA..." : "Run PBA-QAOA"}</button><button className="secondary-btn" onClick={simulateNextStep}><Activity size={17}/> Simulate change</button></div></div><div className="hero-visual"><div className="orbit orbit-1"/><div className="orbit orbit-2"/><div className="core"><BrainCircuit size={45}/><span>QAOA</span></div><div className="node node-a">ML prediction</div><div className="node node-b">Bottleneck</div><div className="node node-c">Reduced QUBO</div></div></section>

    <section className="panel data-panel"><div className="panel-title"><div className="panel-icon"><FileUp/></div><div><h2>Live patient data</h2><p>Import your own records or use the built-in demo scenario.</p></div></div><div className="data-toolbar"><button className="primary-btn" onClick={() => fileRef.current?.click()}><FileUp size={16}/> Import CSV / JSON</button><input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = ""; }}/><button className="secondary-btn" onClick={() => setShowAdd(true)}><Plus size={16}/> Add patient</button><button className="ghost-btn" onClick={downloadSample}><Download size={16}/> Sample CSV</button><button className="ghost-btn" onClick={resetDemo}>Reset demo</button><span className="source-badge">{source}</span></div>{message && <div className="data-message">{message}</div>}
      <div className="resource-grid"><ResourceInput label="ICU beds" value={beds} onChange={setBeds}/><ResourceInput label="Ventilators" value={ventilators} onChange={setVentilators}/><ResourceInput label="Nurses" value={nurses} onChange={setNurses}/><ResourceInput label="QAOA shots" value={shots} min={32} max={4096} onChange={setShots}/></div>
      <div className="format-note"><b>Required columns:</b> patient_id, age, severity, spo2, heart_rate, respiratory_rate, blood_pressure. <b>Optional:</b> current_state (defaults to Waiting), ventilator_need, priority.</div>
    </section>

    {showAdd && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setShowAdd(false)}><X size={18}/></button><h3>Add patient</h3><p>Enter raw patient features. ML risk and priority are inferred by the backend.</p>{message && <div className="data-message">{message}</div>}<div className="form-grid">{([["id", "Patient ID"], ["age", "Age"], ["severity", "Severity (0-100)"], ["spo2", "SpO₂"], ["hr", "Heart rate"], ["rr", "Respiratory rate"], ["bp", "Blood pressure"]] as [keyof PatientForm, string][]).map(([key, label]) => <label key={key}>{label}<input value={form[key]} inputMode={key === "id" ? "text" : "decimal"} onChange={e => setForm(x => ({ ...x, [key]: e.target.value }))}/></label>)}<label>Current state<select value={form.current} onChange={e => setForm(x => ({ ...x, current: e.target.value }))}><option>Waiting</option><option>Stable</option><option>Bed + Nurse</option><option>Ventilator</option></select></label></div><button className="primary-btn" onClick={() => { if (addPatient()) setShowAdd(false); }}><Plus size={16}/> Add to ICU</button></div></div>}

    <section className="stats-grid"><Stat icon={<Stethoscope/>} label="ICU patients" value={patients.length} detail={`Timestep ${timestep}`}/><Stat icon={<Gauge/>} label="Predicted bottleneck" value={result.bottleneck} detail={result.bottleneckReason} accent/><Stat icon={<Layers3/>} label="QUBO variables" value={`${metrics.reducedQuboVars} / ${metrics.fullQuboVars}`} detail="Proposed / full baseline"/><Stat icon={<Timer/>} label="Optimization time" value={fmtMs(metrics.runtimeProposed)} detail={metrics.runtimeFull === null ? "Run the backend to measure" : `vs ${metrics.runtimeFull} ms full classical solve`}/></section>

    <section className="section-grid"><div className="panel"><PanelTitle icon={<BrainCircuit/>} title="Predictive bottleneck engine" subtitle="The new algorithmic layer"/><div className="pipeline"><PipelineStep n="01" title="Predict" text="Estimate near-term patient/resource demand."/><ChevronRight className="arrow"/><PipelineStep n="02" title="Detect" text="Find the resource with highest pressure." active/><ChevronRight className="arrow"/><PipelineStep n="03" title="Reduce" text="Keep only affected patients in QUBO."/><ChevronRight className="arrow"/><PipelineStep n="04" title="Optimize" text="Run QAOA on the reduced problem."/></div><div className="bottleneck-card"><div className="bottleneck-icon"><Zap size={19}/></div><div><div className="small-label">CURRENT PREDICTED BOTTLENECK · {Math.round(result.pressure * 100)}% OF CAPACITY</div><div className="bottleneck-name">{result.bottleneck}</div><div className="muted">{result.bottleneckReason}</div></div><div className="pressure-bar" title={`Demand / capacity = ${result.pressure.toFixed(2)}`}><div style={{ width: `${clamp(Math.round(result.pressure * 100), 0, 100)}%` }}/></div></div></div><div className="panel quantum-panel"><PanelTitle icon={<Cpu/>} title="Quantum optimization" subtitle="QAOA on Qiskit Aer"/><div className="quantum-number">{running ? "…" : metrics.reducedQuboVars}</div><div className="quantum-label">qubits / variables in the reduced QUBO (one per affected patient)</div><div className="mini-comparison"><div><span>Full reoptimization</span><b>{metrics.fullQuboVars}</b></div><div><span>PBA-QAOA</span><b>{metrics.reducedQuboVars}</b></div></div><div className="quantum-note"><ShieldCheck size={16}/> {result.quantumNote ?? "Capacity is enforced as a cardinality penalty term. Run the backend for a QAOA result."}</div></div></section>

    <section className="panel"><PanelTitle icon={<Users/>} title="Patients and predicted risk" subtitle={`${source} • ${Object.keys(predictions).length ? "ML ventilator risk from the last backend run" : "Browser estimate until you run the backend"}`}/><div className="table-wrap"><table><thead><tr><th>Patient</th><th>Severity</th><th>SpO₂</th><th>Ventilator risk</th><th>Priority</th><th>Current state</th><th></th></tr></thead><tbody>{patients.map(p => { const s = effectiveScore(p, predictions[p.id]); return <tr key={p.id} className={affected.has(p.id) ? "affected" : ""}><td><strong>{p.id}</strong><span className="age">{p.age}y</span></td><td><Risk value={p.severity}/></td><td>{p.spo2}%</td><td><Risk value={s.vent} suffix="%"/></td><td><Risk value={s.priority}/></td><td><span className="state">{p.current}</span></td><td><button className="icon-btn" onClick={() => removePatient(p.id)} title="Remove"><Trash2 size={14}/></button></td></tr>; })}</tbody></table></div></section>

    <section className="compare-grid"><div className="panel"><PanelTitle icon={<Layers3/>} title="Allocation comparison" subtitle={result.measured ? "Classical full-problem baseline vs PBA-QAOA" : "Browser preview (greedy), not an optimizer run"}/><div className="allocation-columns"><AllocationColumn title="Full-problem classical baseline" data={result.baseline}/><AllocationColumn title="PBA-QAOA proposed" data={result.proposed} proposed/></div></div><div className="panel"><PanelTitle icon={<Gauge/>} title="Benchmark snapshot" subtitle={result.measured ? "Measured from the current backend run" : "Browser estimate. Runtimes need the backend"}/><MetricRow label={`Critical patients served (of ${metrics.criticalTotal})`} a={metrics.criticalServedFull} b={metrics.criticalServedProposed}/><MetricRow label="Resource utilization" a={metrics.utilizationFull} b={metrics.utilizationProposed} suffix="%"/><MetricRow label="Constraint violations" a={metrics.violationsFull} b={metrics.violationsProposed} invert/><MetricRow label="Allocation changes" a={metrics.changesFull} b={metrics.changesProposed} invert/><MetricRow label="Optimization runtime" a={metrics.runtimeFull} b={metrics.runtimeProposed} suffix=" ms" invert/></div></section>
    <footer><span>Q-ICU</span><span>Prototype for hackathon demonstration • Synthetic/demo data • No clinical decision use</span></footer>
  </main>;
}

function ResourceInput({ label, value, onChange, min = 1, max = 100 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return <label className="resource-input"><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={e => onChange(clamp(Math.round(Number(e.target.value)) || min, min, max))}/></label>;
}
function Stat({ icon, label, value, detail, accent = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; accent?: boolean }) { return <div className={`stat ${accent ? "accent" : ""}`}><div className="stat-icon">{icon}</div><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div></div>; }
function PanelTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <div className="panel-title"><div className="panel-icon">{icon}</div><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
function PipelineStep({ n, title, text, active = false }: { n: string; title: string; text: string; active?: boolean }) { return <div className={`pipeline-step ${active ? "active" : ""}`}><span>{n}</span><b>{title}</b><p>{text}</p></div>; }
function Risk({ value, suffix = "" }: { value: number; suffix?: string }) { const v = clamp(Math.round(value), 0, 100); return <div className="risk"><span>{v}{suffix}</span><div><i style={{ width: `${v}%` }}/></div></div>; }
function AllocationColumn({ title, data, proposed = false }: { title: string; data: Allocation[]; proposed?: boolean }) { return <div className={`alloc-col ${proposed ? "proposed" : ""}`}><div className="alloc-title">{title}</div>{data.length ? data.map((x, i) => <div className="alloc-row" key={`${x.patient}-${i}`}><b>{x.patient}</b><span>{x.bed}</span><span>{x.ventilator}</span><span>{x.nurse}</span><em>{x.status}</em></div>) : <div className="muted">No allocations.</div>}</div>; }
function MetricRow({ label, a, b, suffix = "", invert = false }: { label: string; a: number | null; b: number | null; suffix?: string; invert?: boolean }) {
  const show = (v: number | null) => (v === null ? "—" : `${v}${suffix}`);
  const cls = a === null || b === null ? "" : (invert ? b <= a : b >= a) ? "good" : "warn";
  return <div className="metric-row"><span>{label}</span><b>{show(a)}</b><strong className={cls}>{show(b)}</strong></div>;
}
