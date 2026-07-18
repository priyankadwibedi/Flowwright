import Link from "next/link";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingFooter } from "../../components/marketing/MarketingFooter";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { BackLink } from "../../components/navigation/BackLink";
import { externalLinks, routes } from "../../lib/routes";

const pipelineStages = [
  {
    title: "Browser demonstration",
    description:
      "Screen recording, optional narration, and optional extension events capture what the human actually did.",
  },
  {
    title: "Evidence processing",
    description:
      "Keyframes, transcript text, and browser events are normalized into a timestamped evidence timeline.",
  },
  {
    title: "AI workflow inference",
    description:
      "Multimodal analysis proposes steps, variables, decisions, and uncertainties from untrusted evidence.",
  },
  {
    title: "WorkflowDraft",
    description:
      "Structured model output maps actions to a draft schema with confidence and evidence references.",
  },
  {
    title: "WorkflowIR validation",
    description:
      "Semantic graph validation rejects invalid edges, missing references, and contradictory structure.",
  },
  {
    title: "Human clarification",
    description:
      "Required questions resolve compiler-critical ambiguity before generation proceeds.",
  },
  {
    title: "Trusted compiler",
    description:
      "InvoiceCompilerConfig is extracted only from supported invoice_approval workflows.",
  },
  {
    title: "Generated code",
    description:
      "Deterministic Python templates emit workflow.py and supporting artifacts — never arbitrary shell.",
  },
  {
    title: "Mandatory tests",
    description:
      "Server-owned invoice cases always run; optional workflow tests are additive.",
  },
  {
    title: "Generated application",
    description:
      "The invoice processor reuses the same compiler config as generated code and tests.",
  },
] as const;

const systemLayers = [
  {
    id: "capture",
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
    id: "intelligence",
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
    id: "compiler",
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
    id: "execution",
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

const technologyGroups = [
  {
    label: "Frontend",
    items: ["Next.js", "React", "TypeScript", "Tailwind CSS", "React Flow"],
  },
  {
    label: "Backend",
    items: ["Python", "FastAPI", "Pydantic", "OpenCV"],
  },
  {
    label: "AI",
    items: [
      "OpenAI Responses API",
      "Structured outputs",
      "Transcription",
    ],
  },
  {
    label: "Execution",
    items: [
      "Trusted Python compiler templates",
      "pytest",
      "Synthetic invoice fixtures",
    ],
  },
  {
    label: "Infrastructure",
    items: ["GitHub Pages", "Render", "GitHub Actions"],
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
          <ol className="architecture-pipeline">
            {pipelineStages.map((stage, index) => (
              <li key={stage.title}>
                <div className="architecture-pipeline-node">
                  <span className="architecture-pipeline-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{stage.title}</h3>
                    <p>{stage.description}</p>
                  </div>
                </div>
                {index < pipelineStages.length - 1 && (
                  <span className="architecture-pipeline-arrow" aria-hidden="true">
                    ↓
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="architecture-section" aria-labelledby="layers-heading">
          <h2 id="layers-heading">System layers</h2>
          <div className="architecture-layers">
            {systemLayers.map((layer) => (
              <article key={layer.id} className="architecture-layer-card">
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
          <div className="architecture-stack">
            {technologyGroups.map((group) => (
              <article key={group.label}>
                <h3>{group.label}</h3>
                <p>{group.items.join(" · ")}</p>
              </article>
            ))}
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
