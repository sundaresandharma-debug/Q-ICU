import hmac
import json
import logging
import os
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from threading import Lock
from typing import List

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.engine import _get_model, optimize_icu

logger = logging.getLogger("q_icu")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def log(level: str, msg: str, **fields) -> None:
    """One JSON line per event, so the host's log viewer can search and alert on errors."""
    getattr(logger, level)(json.dumps({"level": level, "msg": msg, **fields}))


@asynccontextmanager
async def lifespan(_: FastAPI):
    _get_model()   # train the synthetic ML model once at startup
    yield


app = FastAPI(title="Q-ICU API", version="1.2.0", lifespan=lifespan)

# The browser talks to the Next.js server, which calls this API with a secret key.
# Direct browser access is off unless ALLOWED_ORIGINS is set.
_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )


# ---------------------------------------------------------------------------
# API key and rate limiting
# ---------------------------------------------------------------------------

def _api_key() -> str:
    return os.getenv("API_KEY", "")


def _rate_limit() -> tuple[int, int]:
    return int(os.getenv("RATE_LIMIT_MAX", "20")), int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))


class SlidingWindowLimiter:
    """In-memory sliding window per client. One process is enough for this service."""

    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, max_hits: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= max_hits:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def _client_key(request: Request, authenticated: bool) -> str:
    # The Next.js proxy forwards a hashed client ID. Trust it only on authenticated calls.
    forwarded = request.headers.get("x-client-key", "")
    if authenticated and forwarded:
        return f"c:{forwarded[:64]}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


@app.middleware("http")
async def guard(request: Request, call_next):
    request_id = uuid.uuid4().hex[:12]
    if request.url.path.startswith("/api/"):
        expected = _api_key()
        provided = request.headers.get("x-api-key", "")
        authenticated = bool(expected) and hmac.compare_digest(provided, expected)
        if expected and not authenticated:
            return JSONResponse({"detail": "Missing or invalid API key."}, status_code=401)
        max_hits, window = _rate_limit()
        if not limiter.allow(_client_key(request, authenticated), max_hits, window):
            return JSONResponse(
                {"detail": f"Too many optimizer runs. Wait {window} seconds, then try again."},
                status_code=429, headers={"Retry-After": str(window)},
            )
    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001 - last-resort handler; details go to the log only
        log("error", "unhandled_exception", request_id=request_id, path=request.url.path, error=repr(exc)[:500])
        return JSONResponse({"detail": f"The optimizer hit an internal error. Reference: {request_id}"}, status_code=500)
    response.headers["X-Request-ID"] = request_id
    return response


# ---------------------------------------------------------------------------
# Models. Only the fields the optimizer uses are accepted (extra fields are rejected).
# ---------------------------------------------------------------------------

class Patient(BaseModel):
    model_config = {"extra": "forbid"}

    # Pseudonymous IDs only: no spaces or @, so names and emails are rejected.
    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    age: int = Field(ge=0, le=120)
    severity: float = Field(ge=0, le=100)
    spo2: float = Field(ge=0, le=100)
    hr: float = Field(gt=0, le=300)
    rr: float = Field(gt=0, le=80)
    bp: float = Field(gt=0, le=300)
    ventilatorNeed: float | None = Field(default=None, ge=0, le=100)
    priority: float | None = Field(default=None, ge=0, le=100)
    # Fixed vocabulary, never free text.
    current: str = Field(
        default="Waiting", max_length=40,
        pattern=r"(?i)^(?:waiting|stable|bed|nurse|ventilator)(?:\s*\+\s*(?:bed|nurse|ventilator)){0,2}$",
    )


class OptimizeRequest(BaseModel):
    model_config = {"extra": "forbid"}

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
    # Patient records are processed in memory only and never written to disk or logs.
    log("info", "optimize_ok", patients=len(ids), runtime_ms=result["api_runtime_ms"])
    return result
