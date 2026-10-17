# Run from the Q-ICU project root after activating .venv
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
