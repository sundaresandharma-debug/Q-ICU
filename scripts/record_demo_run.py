"""Record a measured optimizer run of the built-in demo scenario for the landing page.

Run from the project root:  python scripts/record_demo_run.py
Writes components/icu/demo-run.json. Re-run it whenever the engine or demo data changes.
"""
import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.engine import optimize_icu  # noqa: E402

RESOURCES = {"beds": 8, "ventilators": 4, "nurses": 7}
SHOTS = 256

with open(ROOT / "sample_patients.csv", newline="") as f:
    rows = list(csv.DictReader(f))[:10]

patients = [
    {
        "id": r["patient_id"], "age": int(r["age"]), "severity": float(r["severity"]), "spo2": float(r["spo2"]),
        "hr": float(r["heart_rate"]), "rr": float(r["respiratory_rate"]), "bp": float(r["blood_pressure"]),
        "current": r["current_state"],
    }
    for r in rows
]

res = optimize_icu(patients, reps=1, shots=SHOTS, **RESOURCES)
q = res["quantum"]["parameters"]
out = {
    "recordedOn": date.today().isoformat(),
    "resources": RESOURCES,
    "shots": SHOTS,
    "bottleneck": res["bottleneck"],
    "demand": res["demand"],
    "pressures": res["pressures"],
    "affected": [p["id"] for p in res["affectedPatients"]],
    "priorities": {k: round(v) for k, v in res["priorities"].items()},
    "qaoa": [a for a in res["allocations"]["pbaQaoa"]],
    "classical": [a for a in res["allocations"]["fullBaseline"]],
    "foundOptimum": bool(q.get("foundOptimum")),
    "metrics": {k: res["metrics"][k] for k in ("fullQuboVars", "reducedQuboVars", "fullRuntimeMs", "qaoaRuntimeMs", "baselineMethod")},
    "patients": [{"id": p["id"], "current": p["current"]} for p in patients],
}
(ROOT / "components/icu/demo-run.json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps({k: out[k] for k in ("bottleneck", "demand", "affected", "foundOptimum")}))
