/**
 * ICU tool data model: types, browser preview, file import and validation.
 * Constants are kept in sync with backend/engine.py.
 */
import { PATIENT_ID_PATTERN } from "@/lib/validation";

export type Patient = {
  id: string; age: number; severity: number; spo2: number; hr: number; rr: number; bp: number;
  /** Only set when the user/import supplied it. Never overwritten by model output. */
  ventilatorNeed?: number;
  /** Only set when the user/import supplied it. Never overwritten by model output. */
  priority?: number;
  current: string;
};

/** Model output from the last backend run, kept apart from user-entered data. */
export type Prediction = { vent: number; priority: number };

export type Resources = { beds: number; ventilators: number; nurses: number };
export type ResourceName = "Ventilators" | "Beds" | "Nurses";

export type Allocation = { patient: string; bed: string; ventilator: string; nurse: string; status: string };

export type Metrics = {
  fullQuboVars: number; reducedQuboVars: number;
  runtimeFull: number | null; runtimeProposed: number | null;
  criticalTotal: number; criticalServedFull: number; criticalServedProposed: number;
  utilizationFull: number; utilizationProposed: number;
  violationsFull: number; violationsProposed: number;
  changesFull: number; changesProposed: number;
};

export type Result = {
  /** true = numbers came from the Python/Qiskit backend; false = browser preview estimate. */
  measured: boolean;
  bottleneck: ResourceName; bottleneckReason: string; pressure: number;
  affectedIds: string[];
  baseline: Allocation[]; proposed: Allocation[];
  metrics: Metrics;
  quantumNote?: string;
};

export const VENT_THRESHOLD = 50, BED_SEVERITY = 45, NURSE_SEVERITY = 40;
export const HIGH_PRIORITY = 80, CRITICAL_PRIORITY = 85, MAX_QAOA_VARS = 12, MAX_PATIENTS = 100;
const KEYWORD: Record<ResourceName, string> = { Ventilators: "ventilator", Beds: "bed", Nurses: "nurse" };
export const STATES = ["Waiting", "Stable", "Bed + Nurse", "Ventilator", "Bed + Nurse + Ventilator"] as const;
/** Current state is a fixed vocabulary, never free text, so it cannot carry clinical notes. Mirrors backend/main.py. */
export const STATE_PATTERN = /^(?:waiting|stable|bed|nurse|ventilator)(?:\s*\+\s*(?:bed|nurse|ventilator)){0,2}$/i;
const NONE = "-";

export const SAMPLE_CSV = `patient_id,age,severity,spo2,heart_rate,respiratory_rate,blood_pressure,current_state
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

// ---------- Scoring (browser preview only) ----------

/** Effective vent risk + priority: user value, else last backend prediction, else a rough browser heuristic. */
export function effectiveScore(p: Patient, pred?: Prediction) {
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

export function allocRow(patient: string, slot: string, r: ResourceName, status: string): Allocation {
  return {
    patient, status,
    bed: r === "Beds" ? slot : NONE,
    ventilator: r === "Ventilators" ? slot : NONE,
    nurse: r === "Nurses" ? slot : NONE,
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
export function buildPreview(patients: Patient[], res: Resources, preds: Record<string, Prediction>): Result {
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
      ? `${bn.demand} patients are estimated to need ${r.toLowerCase()}, with ${cap} available (${bn.ratio.toFixed(2)} times capacity, browser estimate).`
      : "Add or import patients to see an estimate.",
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

export function normalizeKey(key: string) { return key.trim().toLowerCase().replace(/[\s-]+/g, "_"); }

export function parseCSV(text: string): Record<string, string>[] {
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

/** Only the columns the optimizer uses are read. Any other column in a file is ignored and never stored. */
export function toPatient(row: Record<string, string>, index: number): Patient {
  const get = (...keys: string[]) => { for (const k of keys) { const v = row[normalizeKey(k)]; if (v !== undefined && v !== "") return v; } return ""; };
  const id = get("patient_id", "id") || `P${String(index + 1).padStart(3, "0")}`;
  const values: Record<string, number> = {};
  for (const [field, column, aliases] of REQUIRED) {
    const raw = get(...aliases);
    const x = Number(raw);
    if (raw === "" || !Number.isFinite(x)) throw new Error(`Row ${index + 2} (${id}): "${column}" is missing or is not a number.`);
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

/** Field-level checks for one patient. Returns a map of field to message. */
export function patientErrors(p: Patient, existingIds: Set<string> = new Set()): Partial<Record<keyof Patient, string>> {
  const e: Partial<Record<keyof Patient, string>> = {};
  if (!p.id.trim()) e.id = "Enter a patient ID, such as P011.";
  else if (!PATIENT_ID_PATTERN.test(p.id)) e.id = "Use up to 32 letters, digits, dashes or underscores. Do not use names or emails.";
  else if (existingIds.has(p.id)) e.id = `${p.id} is already in the list. Each patient needs a different ID.`;
  if (!Number.isInteger(p.age) || p.age < 0 || p.age > 120) e.age = "Enter a whole number from 0 to 120.";
  if (!Number.isFinite(p.severity) || p.severity < 0 || p.severity > 100) e.severity = "Enter a number from 0 to 100.";
  if (!Number.isFinite(p.spo2) || p.spo2 < 0 || p.spo2 > 100) e.spo2 = "Enter a percentage from 0 to 100.";
  if (!Number.isFinite(p.hr) || p.hr <= 0 || p.hr > 300) e.hr = "Enter beats per minute, from 1 to 300.";
  if (!Number.isFinite(p.rr) || p.rr <= 0 || p.rr > 80) e.rr = "Enter breaths per minute, from 1 to 80.";
  if (!Number.isFinite(p.bp) || p.bp <= 0 || p.bp > 300) e.bp = "Enter systolic pressure in mmHg, from 1 to 300.";
  if (!STATE_PATTERN.test(p.current)) e.current = "Use Waiting, Stable, or resources joined with +, such as Bed + Nurse.";
  if (p.ventilatorNeed !== undefined && (p.ventilatorNeed < 0 || p.ventilatorNeed > 100)) e.ventilatorNeed = "Enter a number from 0 to 100.";
  if (p.priority !== undefined && (p.priority < 0 || p.priority > 100)) e.priority = "Enter a number from 0 to 100.";
  return e;
}

export function validatePatients(patients: Patient[]) {
  if (!patients.length) throw new Error("No patient records found in the file.");
  if (patients.length > MAX_PATIENTS) throw new Error(`The file has ${patients.length} patients. The limit is ${MAX_PATIENTS} per run.`);
  const ids = new Set<string>();
  for (const p of patients) {
    const errs = Object.entries(patientErrors(p, ids));
    if (errs.length) throw new Error(`${p.id || "A patient"}: ${errs[0][0]} is invalid. ${errs[0][1]}`);
    ids.add(p.id);
  }
}

export const DEMO_PATIENTS: Patient[] = parseCSV(SAMPLE_CSV).map(toPatient);
export const DEFAULT_RESOURCES: Resources = { beds: 8, ventilators: 4, nurses: 7 };

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
