import Link from "next/link";

const stages = ["Demonstrate", "Understand", "Generate", "Test", "Deploy"];

export default function HomePage() {
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="mark" href="/">
          flowwright
        </Link>
        <div className="navlinks">
          <Link href="/workflows/demo">Workflow demo</Link>
          <Link href="/tests">Test results</Link>
          <a href="/docs/">Docs</a>
        </div>
      </nav>
      <section className="hero">
        <div>
          <div className="eyebrow">AI workflow compiler</div>
          <h1>Turn the way you work into software.</h1>
          <p>
            Flowwright learns a browser-based process from a human demonstration
            and converts it into a structured, tested, executable application.
          </p>
          <div className="actions">
            <Link className="button primary" href="/record">
              Record a workflow
            </Link>
            <Link className="button" href="/workflows/demo">
              Load invoice demo
            </Link>
            <Link className="button" href="/tests">
              View test results
            </Link>
          </div>
          <div className="notice">
            Prototype scope: controlled browser workflows only. Sensitive
            actions always pause for human approval.
          </div>
        </div>
        <div className="panel">
          <div className="eyebrow">The compiler loop</div>
          {stages.map((stage, index) => (
            <div
              key={stage}
              style={{
                padding: "16px 0",
                borderBottom:
                  index === stages.length - 1 ? 0 : "1px solid var(--line)",
              }}
            >
              <strong>{String(index + 1).padStart(2, "0")}</strong> {stage}
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="eyebrow">Built for repeatable work</div>
        <h2>From screen recording to a workflow graph.</h2>
        <div className="cards">
          <div className="card">
            <h3>Demonstrate</h3>
            <p>
              Record your browser screen and optionally capture safe interaction
              events.
            </p>
          </div>
          <div className="card">
            <h3>Understand</h3>
            <p>
              Separate meaningful actions, variables, decisions, and safety
              boundaries.
            </p>
          </div>
          <div className="card">
            <h3>Ship with confidence</h3>
            <p>
              Generate tests for expected and unexpected invoice inputs before
              execution.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
