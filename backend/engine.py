"""
Q-ICU quantum optimization engine.

Pipeline:
1. Estimate ventilator need with a lightweight ML model (trained once).
2. Detect the predicted bottleneck resource (demand / capacity).
3. Select only the patients affected by that bottleneck. Patients outside
   that set keep their current status (that is the point of the
   bottleneck-aware reduction).
4. Build a QUBO with one binary variable per patient:
       x_i = 1  <=>  patient i receives one unit of the bottleneck resource
   plus a cardinality penalty that enforces "exactly K units handed out",
   where K is the free capacity. Units are interchangeable, so slot labels
   (V1, V2, ...) are assigned after solving. This makes it impossible for two
   patients to share a slot and needs far fewer qubits than a patient x slot
   encoding.
5. Solve the reduced QUBO with QAOA (Qiskit + Aer).
6. Compare against a classical solve of the full QUBO and a greedy rule.

The model uses synthetic patient features only. It is a hackathon prototype,
not a clinical decision-support system.
"""

from __future__ import annotations

import math
import time
from typing import Dict, List, Optional, Tuple

import numpy as np
from sklearn.linear_model import LogisticRegression

from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator


# ---------- Tunables ----------

VENTILATOR_RISK_THRESHOLD = 50.0   # % predicted ventilator need
BED_SEVERITY_THRESHOLD = 45.0
NURSE_SEVERITY_THRESHOLD = 40.0
HIGH_PRIORITY = 80.0
CRITICAL_PRIORITY = 85.0

MAX_QAOA_VARS = 12        # statevector simulation is 2^n; keep the demo fast
EXACT_SOLVE_LIMIT = 20    # brute force up to 2^20 states (vectorised)

REWARD_SCALE = 3.0
CHANGE_PENALTY = 0.6      # cost of handing the resource to someone who does not hold it yet

RESOURCE_KEYWORD = {"Ventilators": "ventilator", "Beds": "bed", "Nurses": "nurse"}


# ---------- Prediction ----------

def _training_data(seed: int = 7) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    n = 500
    age = rng.integers(20, 90, n)
    severity = rng.uniform(10, 100, n)
    spo2 = rng.uniform(78, 99, n)
    hr = rng.uniform(60, 145, n)
    rr = rng.uniform(12, 36, n)
    bp = rng.uniform(75, 140, n)

    # Synthetic label-generating rule. This is intentionally transparent.
    score = (
        0.055 * severity
        + 0.035 * (100 - spo2)
        + 0.018 * np.maximum(hr - 90, 0)
        + 0.05 * np.maximum(rr - 20, 0)
        + 0.012 * np.maximum(110 - bp, 0)
        + 0.008 * np.maximum(age - 60, 0)
    )
    probability = 1 / (1 + np.exp(-(score - 4.2)))
    y = (rng.random(n) < probability).astype(int)

    X = np.column_stack([age, severity, spo2, hr, rr, bp])
    return X, y


_MODEL: Optional[LogisticRegression] = None


def _get_model() -> LogisticRegression:
    """Train the synthetic model once per process instead of on every call."""
    global _MODEL
    if _MODEL is None:
        X_train, y_train = _training_data()
        model = LogisticRegression(max_iter=1000, solver="liblinear", random_state=7)
        model.fit(X_train, y_train)
        _MODEL = model
    return _MODEL


def predict_ventilator_need(patients: List[Dict]) -> Dict[str, float]:
    """Predicted ventilator need per patient, as a percentage (0-100)."""
    if not patients:
        return {}
    X = np.array([
        [p["age"], p["severity"], p["spo2"], p["hr"], p["rr"], p["bp"]]
        for p in patients
    ], dtype=float)
    probs = _get_model().predict_proba(X)[:, 1]
    return {p["id"]: round(float(prob * 100), 2) for p, prob in zip(patients, probs)}


# ---------- Helpers ----------

def holds_resource(patient: Dict, resource: str) -> bool:
    return RESOURCE_KEYWORD[resource] in str(patient.get("current", "")).lower()


def needs_resource(patient: Dict, resource: str, predictions: Dict[str, float]) -> bool:
    if resource == "Ventilators":
        return predictions[patient["id"]] >= VENTILATOR_RISK_THRESHOLD
    if resource == "Beds":
        return patient["severity"] >= BED_SEVERITY_THRESHOLD
    return patient["severity"] >= NURSE_SEVERITY_THRESHOLD


# ---------- Bottleneck / reduction ----------

def detect_bottleneck(
    patients: List[Dict],
    predictions: Dict[str, float],
    beds: int,
    ventilators: int,
    nurses: int,
) -> Tuple[str, Dict[str, float], Dict[str, int]]:
    capacity = {"Ventilators": ventilators, "Beds": beds, "Nurses": nurses}
    demand = {
        r: sum(1 for p in patients if needs_resource(p, r, predictions))
        for r in capacity
    }
    pressures = {r: demand[r] / max(capacity[r], 1) for r in capacity}
    bottleneck = max(pressures, key=pressures.get)
    return bottleneck, {r: round(v, 3) for r, v in pressures.items()}, demand


def select_affected(
    patients: List[Dict],
    bottleneck: str,
    predictions: Dict[str, float],
    max_vars: int = MAX_QAOA_VARS,
) -> List[Dict]:
    """Patients competing for the bottleneck resource.

    Includes patients who need it, high-priority patients, and patients who
    currently hold it (they may have to give it up). Capped at ``max_vars``
    so the reduced QUBO always fits the QAOA simulator.
    """
    selected = [
        p for p in patients
        if needs_resource(p, bottleneck, predictions)
        or p["priority"] >= HIGH_PRIORITY
        or holds_resource(p, bottleneck)
    ]
    selected.sort(key=lambda p: p["priority"], reverse=True)
    return selected[:max_vars]


# ---------- QUBO ----------

def build_assignment_qubo(
    patients: List[Dict],
    units: int,
    resource: str,
    predictions: Dict[str, float],
) -> Tuple[np.ndarray, List[str], int]:
    """
    One binary variable per patient: x_i = 1 means patient i gets one unit.

    Energy = sum_i c_i x_i + P * (sum_i x_i - K)^2      (constant dropped)

      c_i = -reward_i (+ CHANGE_PENALTY if the patient does not hold it yet)
      K   = min(units, n)   free units to hand out
      P   > max |c_i|       so breaking the cardinality constraint never pays

    Returns (Q, patient_ids, K) with E(x) = x^T Q x (+ constant).
    """
    n = len(patients)
    K = max(0, min(units, n))
    Q = np.zeros((n, n), dtype=float)
    if n == 0:
        return Q, [], K

    linear = np.zeros(n)
    for i, p in enumerate(patients):
        clinical = p["priority"] / 100.0
        future = (
            predictions[p["id"]] / 100.0 if resource == "Ventilators"
            else p["severity"] / 100.0
        )
        reward = REWARD_SCALE * (0.65 * clinical + 0.35 * future)
        linear[i] = -reward + (0.0 if holds_resource(p, resource) else CHANGE_PENALTY)

    penalty = 1.0 + 2.0 * float(np.max(np.abs(linear)))

    # P * (sum x - K)^2 = P * [sum x_i + 2 sum_{i<j} x_i x_j - 2K sum x_i + K^2]
    for i in range(n):
        Q[i, i] = linear[i] + penalty * (1 - 2 * K)
        for j in range(i + 1, n):
            Q[i, j] = penalty   # symmetric split: Q_ij + Q_ji = 2P
            Q[j, i] = penalty

    return Q, [p["id"] for p in patients], K


def qubo_energy(Q: np.ndarray, bits: np.ndarray) -> float:
    return float(bits @ Q @ bits)


def _all_bitstrings(n: int, start: int, stop: int) -> np.ndarray:
    states = np.arange(start, stop, dtype=np.int64)
    return ((states[:, None] >> np.arange(n)) & 1).astype(np.int8)


def exact_solve(Q: np.ndarray) -> Tuple[np.ndarray, float]:
    """Vectorised brute force. Bit i of the state index is variable i."""
    n = Q.shape[0]
    if n == 0:
        return np.zeros(0, dtype=int), 0.0
    best_e, best_bits = math.inf, None
    chunk = 1 << 16
    for start in range(0, 1 << n, chunk):
        B = _all_bitstrings(n, start, min(start + chunk, 1 << n)).astype(float)
        e = np.einsum("bi,ij,bj->b", B, Q, B)
        k = int(np.argmin(e))
        if e[k] < best_e:
            best_e, best_bits = float(e[k]), B[k].astype(int)
    return best_bits, best_e


def anneal_solve(Q: np.ndarray, restarts: int = 8, sweeps: int = 400, seed: int = 11) -> Tuple[np.ndarray, float]:
    """Simulated annealing with single-bit flips (classical heuristic for large n)."""
    n = Q.shape[0]
    rng = np.random.default_rng(seed)
    W = Q + Q.T
    diag = np.diag(Q)
    best_bits, best_e = None, math.inf
    temps = np.geomspace(max(np.abs(Q).max(), 1.0), 1e-3, sweeps)
    for _ in range(restarts):
        x = rng.integers(0, 2, n)
        field = W @ x - 2 * diag * x            # sum_{j != i} (Q_ij + Q_ji) x_j
        for T in temps:
            for k in rng.permutation(n):
                delta = (1 - 2 * x[k]) * (diag[k] + field[k])
                if delta <= 0 or rng.random() < math.exp(-delta / T):
                    step = 1 - 2 * x[k]
                    x[k] ^= 1
                    field += step * W[:, k]
                    field[k] -= step * W[k, k]
        e = qubo_energy(Q, x)
        if e < best_e:
            best_bits, best_e = x.copy(), e
    return best_bits, best_e


def classical_solve(Q: np.ndarray) -> Tuple[np.ndarray, float, str]:
    if Q.shape[0] <= EXACT_SOLVE_LIMIT:
        bits, e = exact_solve(Q)
        return bits, e, "exact_enumeration"
    bits, e = anneal_solve(Q)
    return bits, e, "simulated_annealing"


# ---------- QAOA from gates, Qiskit Aer ----------

def qubo_to_ising(Q: np.ndarray) -> Tuple[np.ndarray, Dict[Tuple[int, int], float], float]:
    """
    Map E(x) = x^T Q x onto E(z) = offset + sum_i h_i z_i + sum_{i<j} J_ij z_i z_j
    with x_i = (1 - z_i) / 2, i.e. qubit |1> (z = -1) means x = 1.
    """
    n = Q.shape[0]
    h = np.zeros(n)
    J: Dict[Tuple[int, int], float] = {}
    offset = 0.0
    for i in range(n):
        h[i] -= Q[i, i] / 2.0
        offset += Q[i, i] / 2.0
    for i in range(n):
        for j in range(i + 1, n):
            w = Q[i, j] + Q[j, i]
            if abs(w) < 1e-12:
                continue
            # w x_i x_j = w/4 (1 - z_i - z_j + z_i z_j)
            offset += w / 4.0
            h[i] -= w / 4.0
            h[j] -= w / 4.0
            J[(i, j)] = w / 4.0
    return h, J, offset


def build_qaoa_circuit(
    h: np.ndarray,
    J: Dict[Tuple[int, int], float],
    gamma: float,
    beta: float,
    reps: int,
    measure: bool,
) -> QuantumCircuit:
    """|+>^n -> [exp(-i gamma H_C) -> exp(-i beta sum X)]^p."""
    n = len(h)
    qc = QuantumCircuit(n, n) if measure else QuantumCircuit(n)
    qc.h(range(n))
    for _ in range(max(1, reps)):
        for i in range(n):
            if abs(h[i]) > 1e-12:
                qc.rz(2 * gamma * h[i], i)          # RZ(t) = exp(-i t Z / 2)
        for (i, j), coupling in J.items():
            qc.cx(i, j)
            qc.rz(2 * gamma * coupling, j)
            qc.cx(i, j)
        qc.rx(2 * beta, range(n))
    if measure:
        qc.measure(range(n), range(n))
    else:
        qc.save_statevector()
    return qc


def qaoa_solve(
    Q: np.ndarray,
    reps: int = 1,
    shots: int = 256,
    seed: int = 42,
) -> Tuple[np.ndarray, float, Dict[str, int], Dict[str, object]]:
    """
    Small, self-contained QAOA. A 7x7 grid search over (gamma, beta) picks the
    angles with the lowest expected QUBO energy (statevector), then the best
    circuit is sampled with shots and the lowest-energy sample is returned.
    """
    n = Q.shape[0]
    if n == 0:
        return np.zeros(0, dtype=int), 0.0, {"shots": 0, "grid_evaluations": 0}, {"mode": "empty_problem"}
    if n > MAX_QAOA_VARS:
        bits, energy, method = classical_solve(Q)
        return bits, energy, {"shots": 0, "grid_evaluations": 0}, {
            "mode": f"classical_fallback_{method}"
        }

    h, J, _ = qubo_to_ising(Q)

    # Normalise so the grid of gamma values gives sensible phases.
    scale = max(float(np.sum(np.abs(h)) + sum(abs(v) for v in J.values())), 1e-9)
    h_n = h / scale
    J_n = {k: v / scale for k, v in J.items()}

    B = _all_bitstrings(n, 0, 1 << n).astype(float)   # row index == statevector index
    energies = np.einsum("bi,ij,bj->b", B, Q, B)

    gammas = np.linspace(0.15, 2.8, 7)
    betas = np.linspace(0.08, 1.45, 7)
    backend = AerSimulator(method="statevector")

    best_expected = math.inf
    best_params = (float(gammas[0]), float(betas[0]))
    for gamma in gammas:
        for beta in betas:
            qc = build_qaoa_circuit(h_n, J_n, gamma, beta, reps, measure=False)
            result = backend.run(qc, seed_simulator=seed).result()
            probs = np.abs(np.asarray(result.get_statevector(qc))) ** 2
            expected = float(np.dot(probs, energies))
            if expected < best_expected:
                best_expected = expected
                best_params = (float(gamma), float(beta))

    gamma, beta = best_params
    qc = build_qaoa_circuit(h_n, J_n, gamma, beta, reps, measure=True)
    tqc = transpile(qc, backend)
    counts = backend.run(tqc, shots=shots, seed_simulator=seed).result().get_counts()

    def bits_of(key: str) -> np.ndarray:
        return np.array([int(c) for c in key[::-1]], dtype=int)   # Qiskit is little-endian

    best_key = min(counts, key=lambda k: qubo_energy(Q, bits_of(k)))
    best_bits = bits_of(best_key)
    optimum = float(np.min(energies))

    return best_bits, qubo_energy(Q, best_bits), {
        "shots": shots,
        "grid_evaluations": len(gammas) * len(betas),
    }, {
        "gamma": round(gamma, 4),
        "beta": round(beta, 4),
        "expectedEnergy": round(best_expected, 4),
        "optimumEnergy": round(optimum, 4),
        "foundOptimum": bool(abs(qubo_energy(Q, best_bits) - optimum) < 1e-9),
        "mode": "qaoa_aer_statevector_and_shots",
    }


# ---------- Decode / benchmarks ----------

def decode(
    bits: np.ndarray,
    ids: List[str],
    resource: str,
    locked: Optional[List[str]] = None,
) -> List[Dict[str, str]]:
    """Locked patients keep their unit; chosen patients get the next free slot."""
    holders = list(locked or []) + [pid for bit, pid in zip(bits, ids) if int(bit) == 1]
    return [{"patient": pid, "resource": f"{resource[0]}{k + 1}"} for k, pid in enumerate(holders)]


def allocation_metrics(
    alloc: List[Dict[str, str]],
    patients: List[Dict],
    capacity: int,
    resource: str,
) -> Dict[str, float]:
    ids = [a["patient"] for a in alloc]
    slots = [a["resource"] for a in alloc]
    chosen = set(ids)

    violations = (
        max(0, len(chosen) - capacity)        # more patients served than units exist
        + (len(ids) - len(chosen))            # a patient holds two units
        + (len(slots) - len(set(slots)))      # two patients share one unit
    )
    critical = [p for p in patients if p["priority"] >= CRITICAL_PRIORITY]
    changes = sum(1 for p in patients if holds_resource(p, resource) != (p["id"] in chosen))

    return {
        "critical_served": sum(p["id"] in chosen for p in critical),
        "critical_total": len(critical),
        "utilization": round(100.0 * min(len(chosen), capacity) / max(1, capacity), 1),
        "violations": violations,
        "changes": changes,
        "priority_score": round(sum(p["priority"] for p in patients if p["id"] in chosen), 1),
    }


def greedy_solution(
    patients: List[Dict],
    capacity: int,
    bottleneck: str,
    predictions: Dict[str, float],
) -> List[Dict]:
    if bottleneck == "Ventilators":
        ordered = sorted(patients, key=lambda p: (predictions[p["id"]], p["priority"]), reverse=True)
    else:
        ordered = sorted(patients, key=lambda p: p["priority"], reverse=True)
    return [
        {"patient": p["id"], "resource": f"{bottleneck[0]}{i + 1}"}
        for i, p in enumerate(ordered[:capacity])
    ]


def normalize_patients(patients: List[Dict], predictions: Dict[str, float]) -> List[Dict]:
    """Fill ventilatorNeed / priority when the uploaded record did not supply them."""
    normalized = []
    for p in patients:
        q = dict(p)
        pred = predictions[q["id"]]
        q["ventilatorNeed"] = pred if q.get("ventilatorNeed") is None else float(q["ventilatorNeed"])
        q["priority"] = (
            min(99.0, round(0.72 * float(q["severity"]) + 0.28 * pred, 2))
            if q.get("priority") is None
            else float(q["priority"])
        )
        normalized.append(q)
    return normalized


def optimize_icu(
    patients: List[Dict],
    beds: int,
    ventilators: int,
    nurses: int,
    reps: int = 1,
    shots: int = 256,
) -> Dict:
    predictions = predict_ventilator_need(patients)
    patients = normalize_patients(patients, predictions)
    bottleneck, pressures, demand = detect_bottleneck(patients, predictions, beds, ventilators, nurses)
    capacity = {"Ventilators": ventilators, "Beds": beds, "Nurses": nurses}[bottleneck]

    affected = select_affected(patients, bottleneck, predictions)
    affected_ids = {p["id"] for p in affected}

    # Patients outside the affected set keep what they have.
    locked = [p["id"] for p in patients if p["id"] not in affected_ids and holds_resource(p, bottleneck)]
    free_units = max(0, capacity - len(locked))

    # Full-problem classical baseline: every patient, every unit.
    full_Q, full_ids, _ = build_assignment_qubo(patients, capacity, bottleneck, predictions)
    t0 = time.perf_counter()
    full_bits, _, baseline_method = classical_solve(full_Q)
    full_ms = (time.perf_counter() - t0) * 1000

    # Proposed: reduced QUBO over affected patients and the free units only.
    reduced_Q, reduced_ids, _ = build_assignment_qubo(affected, free_units, bottleneck, predictions)
    t1 = time.perf_counter()
    proposed_bits, proposed_energy, qstats, qparams = qaoa_solve(reduced_Q, reps=reps, shots=shots)
    proposed_ms = (time.perf_counter() - t1) * 1000

    full_alloc = decode(full_bits, full_ids, bottleneck)
    proposed_alloc = decode(proposed_bits, reduced_ids, bottleneck, locked=locked)
    greedy_alloc = greedy_solution(patients, capacity, bottleneck, predictions)

    full_m = allocation_metrics(full_alloc, patients, capacity, bottleneck)
    proposed_m = allocation_metrics(proposed_alloc, patients, capacity, bottleneck)
    greedy_m = allocation_metrics(greedy_alloc, patients, capacity, bottleneck)

    return {
        "bottleneck": bottleneck,
        "bottleneckReason": (
            f"{demand[bottleneck]} predicted demand vs {capacity} available "
            f"({pressures[bottleneck]:.2f}× capacity)."
        ),
        "pressures": pressures,
        "demand": demand,
        "predictions": predictions,
        "priorities": {p["id"]: p["priority"] for p in patients},
        "affectedPatients": [
            {**p, "predictedVentilatorNeed": predictions[p["id"]]} for p in affected
        ],
        "lockedPatients": locked,
        "allocations": {
            "fullBaseline": full_alloc,
            "pbaQaoa": proposed_alloc,
            "greedy": greedy_alloc,
        },
        "metrics": {
            "fullQuboVars": int(full_Q.shape[0]),
            "reducedQuboVars": int(reduced_Q.shape[0]),
            "quboReductionPercent": round(100 * (1 - reduced_Q.shape[0] / max(1, full_Q.shape[0])), 1),
            "baselineMethod": baseline_method,
            "fullRuntimeMs": round(full_ms, 2),
            "qaoaRuntimeMs": round(proposed_ms, 2),
            "qaoaCallsFull": 0,
            "qaoaCallsProposed": 1 if qstats.get("grid_evaluations", 0) > 0 else 0,
            "criticalTotal": full_m["critical_total"],
            "criticalServedFull": full_m["critical_served"],
            "criticalServedProposed": proposed_m["critical_served"],
            "utilizationFull": full_m["utilization"],
            "utilizationProposed": proposed_m["utilization"],
            "violationsFull": full_m["violations"],
            "violationsProposed": proposed_m["violations"],
            "changesFull": full_m["changes"],
            "changesProposed": proposed_m["changes"],
            "priorityScoreFull": full_m["priority_score"],
            "priorityScoreProposed": proposed_m["priority_score"],
            "greedyCriticalServed": greedy_m["critical_served"],
            "greedyPriorityScore": greedy_m["priority_score"],
            "greedyViolations": greedy_m["violations"],
            "greedyChanges": greedy_m["changes"],
        },
        "quantum": {
            "backend": "Qiskit Aer",
            "algorithm": "QAOA",
            "reps": reps,
            "shots": shots,
            "stats": qstats,
            "parameters": qparams,
            "quboEnergy": round(float(proposed_energy), 5),
        },
    }


if __name__ == "__main__":
    demo = [
        {"id": "P01", "age": 67, "severity": 92, "spo2": 82, "hr": 126, "rr": 31, "bp": 84, "current": "Ventilator"},
        {"id": "P02", "age": 54, "severity": 76, "spo2": 89, "hr": 112, "rr": 27, "bp": 96, "current": "Ventilator"},
        {"id": "P03", "age": 71, "severity": 64, "spo2": 93, "hr": 102, "rr": 23, "bp": 108, "current": "Bed + Nurse"},
        {"id": "P04", "age": 43, "severity": 48, "spo2": 95, "hr": 94, "rr": 20, "bp": 116, "current": "Bed + Nurse"},
        {"id": "P05", "age": 59, "severity": 87, "spo2": 86, "hr": 118, "rr": 29, "bp": 91, "current": "Waiting"},
        {"id": "P06", "age": 32, "severity": 37, "spo2": 97, "hr": 88, "rr": 18, "bp": 121, "current": "Bed + Nurse"},
    ]
    import json
    print(json.dumps(optimize_icu(demo, 8, 4, 7), indent=2))
