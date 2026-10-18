# Python/Qiskit backend deployment

The backend lives in `backend/` (FastAPI). It is not deployed by Vercel:
qiskit, qiskit-aer and scikit-learn together are larger than Vercel's Python
function limit. Deploy it separately with the root `Dockerfile` (Render,
Railway, Fly.io or a VM), then:

1. Generate a long random key, for example `openssl rand -hex 32`.
2. On the backend host set `API_KEY` to that key.
3. In the Vercel project set `BACKEND_URL` to the backend URL and `BACKEND_API_KEY` to the same key, then redeploy.

The browser never calls the backend directly. It calls `/api/optimize` on the
Next.js server, which adds the key and forwards the request. The backend
rejects calls without the key and limits each client to 20 runs a minute
(`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`).

Without a reachable backend the dashboard shows a clearly labelled browser
estimate (greedy, no runtimes). It never presents those numbers as a QAOA run.
