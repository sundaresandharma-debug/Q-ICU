import Link from "next/link";
import { CapacityFigure } from "@/components/icu/CapacityFigure";
import { planAction, type ResourceName } from "@/components/icu/model";
import run from "@/components/icu/demo-run.json";

/**
 * Figures on this page come from a recorded optimizer run of the demo scenario
 * (scripts/record_demo_run.py), so they match what the demo shows after "Run optimizer".
 */
const r = run.bottleneck as ResourceName;
const demand = run.demand as Record<ResourceName, number>;
const capacity: Record<ResourceName, number> = { Ventilators: run.resources.ventilators, Beds: run.resources.beds, Nurses: run.resources.nurses };
const keyword = r === "Ventilators" ? "ventilator" : r === "Beds" ? "bed" : "nurse";
const article = r === "Ventilators" ? "a ventilator" : r === "Beds" ? "a bed" : "a nurse";
const need = demand[r];
const slotIn = (rows: { patient: string; resource: string }[], id: string) => rows.find(x => x.patient === id)?.resource ?? null;
const excerpt = run.patients
  .filter(p => run.affected.includes(p.id))
  .sort((a, b) => (run.priorities as Record<string, number>)[b.id] - (run.priorities as Record<string, number>)[a.id])
  .slice(0, 4)
  .map(p => {
    const slot = slotIn(run.qaoa, p.id);
    return { id: p.id, priority: (run.priorities as Record<string, number>)[p.id], now: p.current, action: planAction(p.current.toLowerCase().includes(keyword), slot, true), slot };
  });
const sameAsClassical = run.patients.every(p => Boolean(slotIn(run.qaoa, p.id)) === Boolean(slotIn(run.classical, p.id)));
const recorded = new Date(run.recordedOn).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function Home() {
  const n = run.metrics.fullQuboVars, k = run.metrics.reducedQuboVars;
  return (
    <div className="wrap landing">
      <section className="hero" aria-labelledby="landing-title">
        <div className="hero-copy">
          <p className="eyebrow">ICU resource planning <span aria-hidden="true">/</span> Research prototype</p>
          <h1 id="landing-title">See which ICU resource runs out first. Re-plan only the patients it affects.</h1>
          <p className="lede">
            Q-ICU predicts demand for beds, ventilators and nurses, finds the bottleneck, and sends just the affected
            patients to a QAOA optimizer. A classical solver works on the full problem alongside it, so every answer can be checked.
          </p>
          <div className="btn-row">
            <Link href="/demo" className="btn btn-primary">Open the demo</Link>
            <Link href="/signup" className="btn">Create an account</Link>
          </div>
          <p className="meta hero-note">The demo needs no account. Use synthetic data only.</p>
        </div>

        <figure className="specimen" aria-labelledby="fig1-caption">
          <p className="fig-label">Fig. 1 <span aria-hidden="true">/</span> Demo scenario, timestep 12</p>
          <p className="specimen-verdict">{need > capacity[r] ? `${r} run out first.` : "No shortage predicted."}</p>
          <p className="specimen-sub">{need} patients need {article}, {capacity[r]} {capacity[r] === 1 ? "is" : "are"} available.</p>
          <CapacityFigure demand={demand} capacity={capacity} bottleneck={r} />
          <table className="excerpt">
            <caption className="visually-hidden">Highest-priority patients in the reduced problem and their planned action</caption>
            <thead><tr><th scope="col">Patient</th><th scope="col">Priority</th><th scope="col">Now</th><th scope="col">Plan</th></tr></thead>
            <tbody>
              {excerpt.map(x => (
                <tr key={x.id}>
                  <th scope="row">{x.id}</th>
                  <td className="num">{x.priority}</td>
                  <td>{x.now}</td>
                  <td><span className="action" data-action={x.action}>{x.action}{x.slot && <span className="slot">{x.slot}</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <figcaption id="fig1-caption">
            Measured run of the demo&apos;s built-in 10-patient scenario, recorded {recorded}: QAOA with p = 1 and {run.shots} shots on Qiskit Aer.
            Press Run optimizer in the <Link href="/demo">demo</Link> to reproduce it.
          </figcaption>
        </figure>
      </section>

      <section className="editorial" aria-labelledby="why-title">
        <h2 id="why-title">Why shrink the problem</h2>
        <div>
          <p>
            When vitals change, a full re-plan reconsiders every patient for every unit. Most of those patients are nowhere near the
            shortage, and moving them creates churn on the ward.
          </p>
          <p>
            Q-ICU leaves those patients where they are and only asks the optimizer about the ones the shortage touches.
            On the demo scenario that takes the problem from {n} variables to {k}, one qubit per affected patient.
          </p>
        </div>
      </section>

      <section className="editorial" aria-labelledby="method-title">
        <h2 id="method-title">Method, on the demo scenario</h2>
        <ol className="steps-ledger">
          <li>
            <span className="step-n">01</span>
            <div><h3>Predict</h3><p>A logistic regression model, trained on synthetic records, scores each patient for ventilator need.</p></div>
            <span className="step-fig">{n} patients scored</span>
          </li>
          <li>
            <span className="step-n">02</span>
            <div><h3>Detect</h3><p>Demand is divided by capacity for each resource. The highest ratio is the bottleneck.</p></div>
            <span className="step-fig">{r} at {run.pressures[r].toFixed(2)}x</span>
          </li>
          <li>
            <span className="step-n">03</span>
            <div><h3>Reduce</h3><p>Patients who need, hold or are high priority for {r.toLowerCase()} stay in the problem, up to 12. Everyone else keeps what they have.</p></div>
            <span className="step-fig">{n} to {k} variables</span>
          </li>
          <li>
            <span className="step-n">04</span>
            <div><h3>Optimize</h3><p>QAOA on the Qiskit Aer simulator solves the reduced problem. An exact classical solve of the full problem runs beside it.</p></div>
            <span className="step-fig">p = 1, {run.shots} shots</span>
          </li>
        </ol>
      </section>

      <section className="editorial" aria-labelledby="model-title">
        <h2 id="model-title">The objective</h2>
        <div>
          <pre className="formula" aria-label="E of x equals the sum over i of c i x i, plus P times the square of the sum of x i minus K">
E(x) = &#931;<sub>i</sub> c<sub>i</sub> x<sub>i</sub> + P (&#931;<sub>i</sub> x<sub>i</sub> &#8722; K)<sup>2</sup>
          </pre>
          <dl className="defs">
            <div><dt>x<sub>i</sub></dt><dd>1 if patient i gets a unit of the bottleneck resource</dd></div>
            <div><dt>c<sub>i</sub></dt><dd>Minus the patient&apos;s reward from priority and need, plus a cost for moving them</dd></div>
            <div><dt>K</dt><dd>Free units of the resource</dd></div>
            <div><dt>P</dt><dd>Penalty larger than any c<sub>i</sub>, so breaking capacity never pays</dd></div>
          </dl>
          <p className="meta">The project&apos;s test suite checks that the QAOA circuit reproduces these energies exactly.</p>
        </div>
      </section>

      <section className="editorial" aria-labelledby="limits-title">
        <h2 id="limits-title">What the results show, and what they don&apos;t</h2>
        <div className="findings">
          <div>
            <h3>Findings</h3>
            <ul>
              <li>{sameAsClassical && run.foundOptimum
                ? "On the demo scenario QAOA reaches the same allocation as the exact classical solve."
                : "On the demo scenario QAOA and the exact classical solve reach different allocations. Open the demo to compare them."}</li>
              <li>The classical solve is faster: {run.metrics.fullRuntimeMs} ms against {run.metrics.qaoaRuntimeMs} ms for QAOA on the simulator. This objective has no pairwise terms, so ranking patients by score already finds the optimum.</li>
              <li>The saving comes from the reduction step: {k} of {n} patients are reconsidered{sameAsClassical ? ", with the same result" : ""}.</li>
            </ul>
          </div>
          <div>
            <h3>Limits</h3>
            <ul>
              <li>The risk model is trained on synthetic data and is not clinically validated.</li>
              <li>The quantum step runs on a simulator, not quantum hardware.</li>
              <li>Q-ICU is not a medical device. Do not use it for patient care decisions.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">Run it on the demo scenario or your own synthetic CSV.</h2>
        <div className="btn-row">
          <Link href="/demo" className="btn btn-primary">Open the demo</Link>
          <Link href="/legal/privacy" className="btn">Read how we handle data</Link>
        </div>
      </section>
    </div>
  );
}
