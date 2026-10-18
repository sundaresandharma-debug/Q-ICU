import Link from "next/link";

export default function Home() {
  return (
    <div className="wrap">
      <section className="landing-head" aria-labelledby="landing-title">
        <p className="meta">Hackathon research prototype</p>
        <h1 id="landing-title">Plan ICU beds, ventilators and nurses around the next shortage.</h1>
        <p className="lede">
          Q-ICU estimates which resource will run short first, then re-plans only the patients that shortage touches.
          The re-plan runs as a QAOA circuit on the Qiskit Aer simulator and is compared against a classical solver on the same data.
        </p>
        <div className="btn-row">
          <Link href="/demo" className="btn btn-primary">Open the working demo</Link>
          <Link href="/signup" className="btn">Create an account to save scenarios</Link>
        </div>
      </section>

      <section className="page two-col" aria-label="About Q-ICU">
        <div>
          <h2>How a run works</h2>
          <ol className="steps">
            <li><div><h3>Estimate demand</h3><p>A logistic regression model, trained on synthetic records, scores each patient for ventilator need.</p></div></li>
            <li><div><h3>Find the bottleneck</h3><p>Demand is divided by capacity for each resource. The highest ratio is the bottleneck.</p></div></li>
            <li><div><h3>Shrink the problem</h3><p>Only patients who need, hold or are high priority for that resource stay in the model, up to 12.</p></div></li>
            <li><div><h3>Solve and compare</h3><p>QAOA solves the smaller problem. A classical solver handles the full one. Both results are shown side by side.</p></div></li>
          </ol>
        </div>
        <div>
          <h2>Limits you should know about</h2>
          <ul>
            <li>The model is trained on synthetic data. Its scores are not clinically validated.</li>
            <li>The quantum step runs on a simulator. For this objective a sorted list finds the same answer, which the results panel states.</li>
            <li>Q-ICU is not a medical device. Do not use it for patient care decisions.</li>
            <li>Use made-up or fully de-identified records only. Never enter names, record numbers or dates of birth.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
