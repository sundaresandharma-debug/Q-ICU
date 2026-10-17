"""Run from the project root:  python -m pytest tests -q"""
import numpy as np
import pytest

from backend import engine as E

SAMPLE = [
    ("P001", 67, 92, 84, 126, 31, 84, "Waiting"),
    ("P002", 54, 76, 89, 112, 27, 96, "Ventilator"),
    ("P003", 71, 64, 93, 102, 23, 108, "Bed + Nurse"),
    ("P004", 43, 48, 95, 94, 20, 116, "Stable"),
    ("P005", 59, 87, 86, 118, 29, 91, "Waiting"),
    ("P006", 32, 37, 97, 88, 18, 121, "Stable"),
    ("P007", 78, 69, 91, 109, 25, 99, "Bed + Nurse"),
    ("P008", 61, 58, 94, 97, 21, 111, "Waiting"),
    ("P009", 49, 81, 88, 115, 28, 93, "Waiting"),
    ("P010", 36, 29, 98, 78, 15, 124, "Stable"),
]


def patients():
    return [dict(id=i, age=a, severity=s, spo2=o, hr=h, rr=r, bp=b, current=c)
            for i, a, s, o, h, r, b, c in SAMPLE]


def prepared():
    ps = patients()
    pred = E.predict_ventilator_need(ps)
    return E.normalize_patients(ps, pred), pred


def test_low_risk_patients_do_not_count_as_ventilator_demand():
    ps, pred = prepared()
    _, _, demand = E.detect_bottleneck(ps, pred, 8, 4, 7)
    assert demand["Ventilators"] == sum(v >= 50 for v in pred.values())
    assert demand["Ventilators"] < len(ps)


@pytest.mark.parametrize("units", [0, 1, 2, 4, 7, 12])
def test_qubo_optimum_respects_capacity(units):
    ps, pred = prepared()
    Q, ids, K = E.build_assignment_qubo(ps, units, "Ventilators", pred)
    bits, _ = E.exact_solve(Q)
    assert bits.sum() == K == min(units, len(ps))
    alloc = E.decode(bits, ids, "Ventilators")
    m = E.allocation_metrics(alloc, ps, units, "Ventilators")
    assert m["violations"] == 0


def test_overbooking_is_counted_as_violation():
    ps, _ = prepared()
    bad = [{"patient": p["id"], "resource": "V1"} for p in ps[:5]]
    assert E.allocation_metrics(bad, ps, 2, "Ventilators")["violations"] > 0


def test_ising_mapping_reproduces_qubo_energies():
    rng = np.random.default_rng(0)
    for _ in range(5):
        Q = rng.normal(size=(6, 6))
        h, J, off = E.qubo_to_ising(Q)
        B = E._all_bitstrings(6, 0, 64).astype(float)
        Z = 1 - 2 * B
        ising = off + Z @ h + sum(v * Z[:, i] * Z[:, j] for (i, j), v in J.items())
        np.testing.assert_allclose(ising, np.einsum("bi,ij,bj->b", B, Q, B), atol=1e-9)


def test_qaoa_circuit_phase_matches_energies():
    """The diagonal cost unitary must carry phase exp(-i*gamma*E(x))."""
    from qiskit.quantum_info import Operator
    ps, pred = prepared()
    Q, _, _ = E.build_assignment_qubo(ps[:4], 2, "Ventilators", pred)
    h, J, off = E.qubo_to_ising(Q)
    qc = E.build_qaoa_circuit(h, J, gamma=0.1, beta=0.0, reps=1, measure=False)
    qc.data = [d for d in qc.data if d.operation.name in ("rz", "cx")]
    U = Operator(qc).data
    B = E._all_bitstrings(4, 0, 16).astype(float)
    energies = np.einsum("bi,ij,bj->b", B, Q, B) - off
    phases = np.diag(U)
    ratio = phases / np.exp(-1j * 0.1 * energies)
    assert np.allclose(ratio, ratio[0])   # equal up to a global phase


def test_annealer_matches_exact_on_small_problem():
    ps, pred = prepared()
    Q, _, _ = E.build_assignment_qubo(ps, 4, "Ventilators", pred)
    assert abs(E.anneal_solve(Q)[1] - E.exact_solve(Q)[1]) < 1e-9


def test_end_to_end_sample():
    res = E.optimize_icu(patients(), beds=8, ventilators=4, nurses=7)
    m = res["metrics"]
    cap = {"Ventilators": 4, "Beds": 8, "Nurses": 7}[res["bottleneck"]]
    assert m["violationsFull"] == 0 and m["violationsProposed"] == 0
    assert len(res["allocations"]["pbaQaoa"]) <= cap
    assert m["reducedQuboVars"] <= E.MAX_QAOA_VARS
    assert res["quantum"]["parameters"]["mode"] == "qaoa_aer_statevector_and_shots"


def test_large_input_uses_annealing_and_stays_valid():
    rng = np.random.default_rng(3)
    ps = [dict(id=f"X{i}", age=int(rng.integers(20, 90)), severity=float(rng.uniform(10, 99)),
               spo2=float(rng.uniform(80, 99)), hr=100.0, rr=22.0, bp=100.0, current="Waiting")
          for i in range(40)]
    res = E.optimize_icu(ps, beds=10, ventilators=6, nurses=8)
    assert res["metrics"]["baselineMethod"] == "simulated_annealing"
    assert res["metrics"]["violationsFull"] == 0
    assert res["metrics"]["violationsProposed"] == 0
