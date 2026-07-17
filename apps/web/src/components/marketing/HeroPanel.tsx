import Link from "next/link";

export function HeroPanel() {
  return (
    <div className="hero-panel" id="product">
      <div className="eyebrow">Show the work. Ship the workflow.</div>
      <h1>
        Turn a browser task into <span>tested software.</span>
      </h1>
      <p>
        Record yourself completing a task. Flowwright identifies the steps,
        decisions, variables, and exceptions, then generates an inspectable
        workflow, tested code, and a reusable application.
      </p>
      <div className="hero-actions">
        <Link className="button button-amber" href="/record">
          Record a workflow <span aria-hidden="true">→</span>
        </Link>
        <Link className="button button-outline" href="/workflows/demo">
          Watch the demo
        </Link>
      </div>
      <div className="trust-line">
        <span></span> Demonstration <i>→</i> Workflow IR <i>→</i> Generated code{" "}
        <i>→</i> Tests
      </div>
    </div>
  );
}
