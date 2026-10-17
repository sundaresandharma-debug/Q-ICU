import os
import time
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.engine import _get_model, optimize_icu

app = FastAPI(title="Q-ICU API", version="1.1.0")

# Comma-separated list, e.g. "https://q-icu.vercel.app,http://localhost:3000".
# Defaults to "*" for local hackathon use. No cookies/auth are used, so
# credentials stay disabled (browsers reject "*" together with credentials).
_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm_model() -> None:
    _get_model()   # train the synthetic ML model once at startup


class Patient(BaseModel):
    id: str = Field(min_length=1)
    age: int = Field(ge=0, le=120)
    severity: float = Field(ge=0, le=100)
    spo2: float = Field(ge=0, le=100)
    hr: float = Field(gt=0)
    rr: float = Field(gt=0)
    bp: float = Field(gt=0)
    ventilatorNeed: float | None = Field(default=None, ge=0, le=100)
    priority: float | None = Field(default=None, ge=0, le=100)
    current: str = "Waiting"


class OptimizeRequest(BaseModel):
    patients: List[Patient] = Field(min_length=1, max_length=100)
    beds: int = Field(default=8, ge=1, le=100)
    ventilators: int = Field(default=4, ge=1, le=100)
    nurses: int = Field(default=7, ge=1, le=100)
    qaoa_reps: int = Field(default=1, ge=1, le=3)
    shots: int = Field(default=256, ge=32, le=4096)


@app.get("/health")
def health():
    return {"ok": True, "service": "Q-ICU", "quantum_backend": "Qiskit Aer"}


@app.post("/api/optimize")
def optimize(req: OptimizeRequest):
    start = time.perf_counter()
    patient_data = [p.model_dump() for p in req.patients]
    ids = [p["id"] for p in patient_data]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Patient IDs must be unique.")
    result = optimize_icu(
        patient_data,
        beds=req.beds,
        ventilators=req.ventilators,
        nurses=req.nurses,
        reps=req.qaoa_reps,
        shots=req.shots,
    )
    result["api_runtime_ms"] = round((time.perf_counter() - start) * 1000, 2)
    return result
