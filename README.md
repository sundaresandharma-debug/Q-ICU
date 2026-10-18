# Q-ICU: Predictive Bottleneck-Aware Quantum Optimization

Q-ICU is a hackathon prototype for dynamic ICU resource allocation. It combines a lightweight ML prediction layer with bottleneck-aware problem reduction and a QUBO/QAOA workflow using Qiskit Aer.

This is a synthetic hackathon prototype and is **not** a clinical decision-support system.

## Features

- Working demo at `/demo` with a built-in 10-patient scenario. No account needed.
- Accounts (Supabase): sign up, sign in, sign out, password reset, onboarding, saved scenarios, data export and account deletion.
- Import patient records from CSV or JSON, add patients by hand, remove records.
- Configure ICU beds, ventilators, nurses and QAOA shots.
- ML ventilator risk and derived priority from the backend are shown after a run. They are kept separate from user-entered values, so later timesteps recompute them.
- When the backend is unreachable, the tool shows a browser estimate, clearly labelled. It shows no runtimes and is never presented as a QAOA result.

Launch requirements (legal pages, consent, RLS, rate limiting, backups and more) are mapped to code in [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md).

## Accepted patient columns

Required:

```text
patient_id, age, severity, spo2, heart_rate, respiratory_rate, blood_pressure
```

Optional:

```text
current_state (defaults to Waiting), ventilator_need, priority
```

`patient_id` must be a short code (letters, digits, `-`, `_`, up to 32 characters), so names and emails are rejected. `current_state` is `Waiting`, `Stable`, or resources joined with `+` (for example `Bed + Nurse`). Other columns in a file are ignored. Use synthetic data only.

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

### Frontend

```powershell
npm install
copy .env.example .env.local   # then fill in the values you have
npm run dev
```

Open `http://localhost:3000`. The browser calls `/api/optimize` on the Next.js server, which forwards to `BACKEND_URL` (default `http://localhost:8000`). The demo works without Supabase. Accounts need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, and the migration in `supabase/migrations/0001_init.sql`.

### Checks

```powershell
pip install -r requirements-dev.txt
python -m pytest tests -q        # optimizer, API key, rate limit, input rules
npm run check                    # design rules, colour contrast, TypeScript
npm run build
```

CI (`.github/workflows/ci.yml`) also runs the database migration and the row level security tests in `supabase/tests/rls.sql` against Postgres 16.

## Deploying

1. Supabase: create a project, run the migration, and follow the dashboard settings in `docs/LAUNCH_CHECKLIST.md`.
2. Backend: deploy the `Dockerfile` (see `api/README.md`) with `API_KEY` set.
3. Vercel: deploy this repo and set the variables from `.env.example`. Keep `SUPABASE_SERVICE_ROLE_KEY`, `BACKEND_API_KEY` and `RATE_LIMIT_SALT` server-only (no `NEXT_PUBLIC_` prefix).
4. Backups: add the `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` secrets and set the `ENABLE_DB_BACKUP` variable to `true`.

## Project docs

- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md): where each launch requirement is handled.
- [`docs/THIRD_PARTY_AUDIT.md`](docs/THIRD_PARTY_AUDIT.md): dependencies, services, fonts and image licences.
- [`docs/DESIGN_RULES.md`](docs/DESIGN_RULES.md): visual rules for the frontend redesign.
