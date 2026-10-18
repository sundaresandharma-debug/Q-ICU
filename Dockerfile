# Python/Qiskit backend. Deploy this on Render, Railway, Fly.io, etc.
# (qiskit + qiskit-aer + scikit-learn exceed Vercel's Python function size limit.)
FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
RUN useradd --create-home --uid 10001 app
USER app
ENV PORT=8000
# Required in production: API_KEY (shared with the Next.js server as BACKEND_API_KEY).
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
