import Link from "next/link";

export function HeroPanel() {
  return (
    <div className="hero-panel" id="product">
      <div className="eyebrow">AI workflow compiler</div>
      <h1>
        Show the work. <span>Ship the workflow.</span>
      </h1>
      <p>
        Record yourself completing a browser task. Flowwright identifies the
        steps, decisions, and exceptions, then generates a tested application
        that can repeat the process reliably.
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
