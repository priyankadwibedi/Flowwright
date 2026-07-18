import Link from "next/link";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingFooter } from "../../components/marketing/MarketingFooter";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { BackLink } from "../../components/navigation/BackLink";
import { externalLinks, routes } from "../../lib/routes";

const compactPipeline = [
  ["Capture", "Screen, narration, and browser events become evidence."],
  ["Infer", "AI proposes a draft workflow from untrusted evidence."],
  ["Validate", "WorkflowIR and clarifications harden the graph."],
  ["Compile", "Trusted templates emit deterministic Python."],
  ["Verify", "Mandatory tests and the invoice app reuse the same rules."],
] as const;

const detailedPipeline = [
  "Browser demonstration",
  "Evidence processing",
  "AI workflow inference",
  "WorkflowDraft",
  "WorkflowIR validation",
  "Human clarification",
  "Trusted compiler",
  "Generated code",
  "Mandatory tests",
  "Generated application",
] as const;

const systemLayers = [
  {
    title: "Capture layer",
    items: [
      "Browser screen recording",
      "Optional microphone narration",
      "Chrome extension browser events",
      "Safe-field filtering",
      "Timestamped evidence",
    ],
  },
  {
    title: "Intelligence layer",
    items: [
      "Video-frame extraction",
      "Speech transcription",
      "Multimodal OpenAI analysis",
      "Evidence-linked inference",
      "Confidence and uncertainty",
      "Untrusted-content boundary",
    ],
  },
  {
    title: "Compiler layer",
    items: [
      "Strict WorkflowDraft schema",
      "Validated WorkflowIR",
      "Semantic graph validation",
      "Human clarification",
      "InvoiceCompilerConfig",
      "Trusted Python templates",
    ],
  },
  {
    title: "Execution layer",
    items: [
      "Generated workflow.py",
      "Generated test_workflow.py",
      "Mandatory server-owned test cases",
      "Restricted execution",
      "Human approval boundaries",
      "Generated invoice application",
    ],
  },
] as const;

export default function ArchitecturePage() {
  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <section className="architecture-page content-width">
        <BackLink href={routes.home} label="Back to home" />
        <header className="architecture-heading">
          <div className="eyebrow">System architecture</div>
          <h1>How Flowwright turns a demonstration into tested software.</h1>
          <p className="architecture-lede">
            Flowwright separates probabilistic AI understanding from
            deterministic compilation and execution. Human demonstrations become
            evidence, evidence becomes a validated workflow, and only supported
            workflows are compiled through trusted templates.
          </p>
        </header>

        <section className="architecture-section" aria-labelledby="pipeline-heading">
          <h2 id="pipeline-heading">Architecture pipeline</h2>
          <ol className="architecture-compact-pipeline">
            {compactPipeline.map(([title, description], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <details className="architecture-details">
            <summary>Show detailed ten-stage pipeline</summary>
            <ol className="architecture-pipeline">
              {detailedPipeline.map((stage, index) => (
                <li key={stage}>
                  <div className="architecture-pipeline-node">
                    <span className="architecture-pipeline-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{stage}</h3>
                    </div>
                  </div>
                  {index < detailedPipeline.length - 1 && (
                    <span
                      className="architecture-pipeline-arrow"
                      aria-hidden="true"
                    >
                      ↓
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        </section>

        <section className="architecture-section" aria-labelledby="layers-heading">
          <h2 id="layers-heading">System layers</h2>
          <div className="architecture-layers">
            {systemLayers.map((layer) => (
              <article key={layer.title} className="architecture-layer-card">
                <h3>{layer.title}</h3>
                <ul>
                  {layer.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className="architecture-trust-boundary"
          aria-labelledby="trust-boundary-heading"
        >
          <div className="eyebrow">Trust boundary</div>
          <h2 id="trust-boundary-heading">
            Where AI stops and deterministic software begins
          </h2>
          <ul className="architecture-trust-list">
            <li>AI interprets evidence and proposes workflow structure.</li>
            <li>Pydantic validation rejects invalid output.</li>
            <li>Human clarification resolves uncertainty.</li>
            <li>The compiler accepts only supported workflow kinds.</li>
            <li>Generated execution uses trusted templates.</li>
            <li>Sensitive actions require human approval.</li>
            <li>Arbitrary model-generated shell commands are never executed.</li>
          </ul>
        </section>

        <section className="architecture-section" aria-labelledby="stack-heading">
          <h2 id="stack-heading">Technology stack</h2>
          <div className="architecture-stack compact">
            <p>
              <b>Frontend</b> Next.js · React · TypeScript · Tailwind CSS ·
              React Flow
            </p>
            <p>
              <b>Backend</b> Python · FastAPI · Pydantic · OpenCV
            </p>
            <p>
              <b>AI</b> OpenAI Responses API · structured outputs ·
              transcription
            </p>
            <p>
              <b>Execution</b> Trusted Python templates · pytest · synthetic
              fixtures
            </p>
            <p>
              <b>Infrastructure</b> GitHub Pages · Render · GitHub Actions
            </p>
          </div>
        </section>

        <section className="architecture-boundary-note">
          <h2>Current prototype boundary</h2>
          <p>
            Current hackathon scope: browser-based invoice approval workflows.
            Other workflows may be inferred and visualized, but only supported
            invoice workflows are compiled and executed.
          </p>
        </section>

        <section className="architecture-actions">
          <Link className="button button-amber" href={routes.demo}>
            View live demo
          </Link>
          <Link className="button button-outline" href={routes.record}>
            Record a workflow
          </Link>
          <a
            className="button button-outline"
            href={externalLinks.github}
            target="_blank"
            rel="noreferrer"
          >
            View source code
          </a>
        </section>
      </section>
      <MarketingFooter />
    </main>
  );
}
