# Q-ICU — Predictive Bottleneck-Aware Quantum Optimization

Q-ICU is a hackathon prototype for dynamic ICU resource allocation. It combines a lightweight ML prediction layer with bottleneck-aware problem reduction and a QUBO/QAOA workflow using Qiskit Aer.

This is a synthetic hackathon prototype and is **not** a clinical decision-support system.

## Features

- Built-in 10-patient **demo scenario** (loaded on start, restored with *Reset demo*).
- Import patient records from **CSV or JSON**, add patients manually, remove records.
- Configure ICU beds, ventilators, nurses and QAOA shots from the UI.
- ML ventilator risk and derived priority from the backend are shown after a run. They are kept separate from user-entered values, so later timesteps recompute them.
- When the backend is unreachable, the dashboard shows a **browser preview** clearly labelled as an estimate. It shows no runtimes and is never presented as a QAOA result.

## Accepted patient columns

Required:

```text
patient_id, age, severity, spo2, heart_rate, respiratory_rate, blood_pressure
```

Optional:

```text
current_state (defaults to Waiting), ventilator_need, priority
```

Aliases: `id`, `hr`, `rr`, `bp`, `oxygen_saturation`, `state`, `current`. A missing or non-numeric required value is reported as an import error rather than silently defaulted.

## How the optimizer works

```text
Patient records
   ↓  ML ventilator-risk prediction (logistic regression, trained once at startup)
   ↓  Bottleneck detection: demand / capacity per resource
   ↓  Affected patients: need the resource, priority ≥ 80, or currently hold it (max 12)
   ↓  Unaffected patients keep what they currently hold
   ↓  Reduced QUBO: one binary variable per affected patient
   ↓  QAOA (Qiskit Aer): 7×7 γ/β grid on the statevector, then sampled with shots
   ↓  Allocation + benchmark metrics vs a classical solve of the full QUBO and a greedy rule
```

**QUBO formulation.** `x_i = 1` means patient *i* receives one unit of the bottleneck resource.

```text
E(x) = Σ c_i x_i + P (Σ x_i − K)²
c_i  = −reward_i (+0.6 if the patient does not already hold the resource)
K    = free units of the bottleneck resource
P    > max |c_i|   (so exceeding or under-using capacity never pays)
```

Units are interchangeable, so slot labels (V1, V2, …) are assigned after solving. Two patients can therefore never share a slot. This also needs one qubit per patient instead of patients × slots.

**Ising mapping.** `x = (1 − z)/2` gives `h_i = −Q_ii/2 − Σ_{j≠i}(Q_ij+Q_ji)/4` and `J_ij = (Q_ij+Q_ji)/4`. `tests/test_engine.py` checks that the circuit's cost unitary reproduces the QUBO energies exactly.

**Baseline.** The full-problem classical QUBO is solved by exact enumeration up to 20 variables, and by simulated annealing above that. The method used is returned as `metrics.baselineMethod`.

**Metrics.**
- Critical served: patients with priority ≥ 85 who get the resource.
- Utilization: units used / capacity.
- Violations: over-capacity, duplicate patients, or shared slots.
- Allocation changes: patients whose holds/doesn't-hold status changes.
- Runtimes: measured wall-clock time.

The response field `quantum.parameters.foundOptimum` says whether QAOA reached the exact optimum of the reduced QUBO.

> Note: the current objective has only per-patient terms plus the capacity penalty, so a top-K sort solves it optimally too. Add pairwise terms (e.g. nurse-load coupling between patients) if you want a problem where the quantum solver matters.

## Run locally

### Backend (Python 3.12 recommended)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

### Tests

```powershell
pip install -r requirements-dev.txt
python -m pytest tests -q
```

### Frontend

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend calls `http://localhost:8000` by default. Copy `.env.example` to `.env.local` to change it.

## Deploying

Vercel only hosts the Next.js frontend. Deploy the backend separately with the `Dockerfile` (see `api/README.md`), set `ALLOWED_ORIGINS` on the backend, and set `NEXT_PUBLIC_API_URL` in Vercel.
