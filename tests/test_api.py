"""API-level checks: input rules, API key, rate limiting."""
import pytest
from fastapi.testclient import TestClient

from backend import main

PATIENT = {"id": "P001", "age": 60, "severity": 80, "spo2": 88, "hr": 110, "rr": 26, "bp": 95, "current": "Waiting"}
BODY = {"patients": [PATIENT, {**PATIENT, "id": "P002", "current": "Ventilator"}], "beds": 2, "ventilators": 1, "nurses": 2, "shots": 64}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setenv("RATE_LIMIT_MAX", "100")
    main.limiter.reset()
    with TestClient(main.app) as c:
        yield c


def test_optimize_ok(client):
    r = client.post("/api/optimize", json=BODY)
    assert r.status_code == 200
    assert r.headers["x-request-id"]
    assert set(r.json()["predictions"]) == {"P001", "P002"}


@pytest.mark.parametrize("bad_id", ["Jane Doe", "jane@example.com", "x" * 33, ""])
def test_identifying_ids_rejected(client, bad_id):
    body = {**BODY, "patients": [{**PATIENT, "id": bad_id}]}
    assert client.post("/api/optimize", json=body).status_code == 422


def test_free_text_state_and_extra_fields_rejected(client):
    assert client.post("/api/optimize", json={**BODY, "patients": [{**PATIENT, "current": "intubated, DOB 1990"}]}).status_code == 422
    assert client.post("/api/optimize", json={**BODY, "patients": [{**PATIENT, "name": "Jane"}]}).status_code == 422


def test_api_key_required_when_set(client, monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    assert client.post("/api/optimize", json=BODY).status_code == 401
    assert client.post("/api/optimize", json=BODY, headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post("/api/optimize", json=BODY, headers={"X-API-Key": "secret"}).status_code == 200
    assert client.get("/health").status_code == 200


def test_rate_limit(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_MAX", "2")
    small = {**BODY, "shots": 32}
    assert client.post("/api/optimize", json=small).status_code == 200
    assert client.post("/api/optimize", json=small).status_code == 200
    r = client.post("/api/optimize", json=small)
    assert r.status_code == 429
    assert r.headers["retry-after"]
