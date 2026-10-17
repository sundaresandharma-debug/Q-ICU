# Python/Qiskit backend deployment

The backend lives in `backend/` (FastAPI). It is **not** deployed by Vercel:
qiskit, qiskit-aer and scikit-learn together are larger than Vercel's Python
function limit. Deploy it separately with the root `Dockerfile` (Render,
Railway, Fly.io, a VM...), then:

1. Set `ALLOWED_ORIGINS` on the backend to your Vercel URL.
2. Set `NEXT_PUBLIC_API_URL` in the Vercel project to the backend URL and redeploy.

Without a reachable backend the dashboard shows a clearly labelled browser
preview (greedy estimate, no runtimes). It never presents those numbers as a QAOA run.
