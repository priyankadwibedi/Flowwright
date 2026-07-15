import { ProductPreviewTile } from "./ProductPreviewTile";

export function HeroMosaic() {
  return (
    <div className="hero-mosaic" aria-hidden="true">
      <ProductPreviewTile
        eyebrow="01 / capture"
        title="Record the task"
        className="tile-recording"
      >
        <div className="mini-toolbar">
          <span className="record-pulse" /> Recording <strong>01:23</strong>
        </div>
        <div className="mini-timeline">
          <span />
          <span />
          <span />
          <span />
          <i />
        </div>
        <div className="mini-caption">browser tab · event log ready</div>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="02 / intent"
        title="Understand intent"
        tone="dark"
        className="tile-intent"
      >
        <div className="intent-row">
          <span className="check-mark">✓</span>
          <span>Open invoice portal</span>
        </div>
        <div className="intent-row">
          <span className="check-mark">✓</span>
          <span>Match purchase order</span>
        </div>
        <div className="intent-row muted">
          <span className="cross-mark">×</span>
          <span>Accidental tab switch</span>
        </div>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="03 / variables"
        title="Find variables"
        tone="amber"
        className="tile-variables"
      >
        <div className="variable-list">
          <span>supplier</span>
          <b>Acme Supplies</b>
          <span>invoice_total</span>
          <b>$4,280.00</b>
        </div>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="04 / compile"
        title="Build the workflow"
        className="tile-graph"
      >
        <div className="mini-graph">
          <span className="mini-node" />
          <i />
          <span className="mini-node accent" />
          <i />
          <span className="mini-node" />
          <i />
          <span className="mini-node review" />
        </div>
        <div className="mini-caption">7 steps · 3 decision paths</div>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="05 / generate"
        title="Generate code"
        tone="dark"
        className="tile-code"
      >
        <pre>
          <code>
            <span>const</span> approval = <em>await</em> workflow.run();{"\n"}
            <span>if</span> (approval.needsReview) review();
          </code>
        </pre>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="06 / verify"
        title="Test the workflow"
        className="tile-tests"
      >
        <div className="test-lines">
          <span>
            <b>✓</b> exact match <small>passed</small>
          </span>
          <span>
            <b>!</b> missing PO <small>review</small>
          </span>
          <span>
            <b>✓</b> amount check <small>passed</small>
          </span>
        </div>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="07 / guardrail"
        title="Approval required"
        tone="teal"
        className="tile-approval"
      >
        <div className="approval-lock">
          <span>↗</span>
          <div>
            <strong>Approve invoice</strong>
            <small>human gate · high impact</small>
          </div>
        </div>
      </ProductPreviewTile>
      <ProductPreviewTile
        eyebrow="08 / ship"
        title="Deploy the application"
        tone="dark"
        className="tile-deploy"
      >
        <div className="deploy-card">
          <span className="deploy-icon">FW</span>
          <div>
            <strong>Invoice processor</strong>
            <small>ready for review</small>
          </div>
          <span className="status-chip">ready</span>
        </div>
      </ProductPreviewTile>
    </div>
  );
}
