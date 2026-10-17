# Python/Qiskit backend. Deploy this on Render, Railway, Fly.io, etc.
# (qiskit + qiskit-aer + scikit-learn exceed Vercel's Python function size limit.)
FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
ENV PORT=8000
# Set ALLOWED_ORIGINS to your frontend URL, e.g. https://q-icu.vercel.app
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
