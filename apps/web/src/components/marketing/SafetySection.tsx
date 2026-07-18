const safetyItems = [
  ["Approval gates", "Sensitive actions require explicit human approval."],
  [
    "Backend secrets",
    "API keys remain on the backend and never enter the browser bundle.",
  ],
  [
    "Evidence upload consent",
    "Your recording stays local until you select Process evidence. Processing temporarily uploads it to the configured backend. Selected frames and transcript text may later be sent to the configured AI provider when you request AI inference.",
  ],
  [
    "Test before use",
    "Generated tests run in a temporary working directory with a scrubbed environment and timeout. Network isolation is not currently implemented.",
  ],
  [
    "Synthetic data",
    "The prototype uses fictional invoice and purchase-order records.",
  ],
] as const;

export function SafetySection() {
  return (
    <section className="safety-section" id="architecture">
      <div className="content-width safety-layout">
        <div>
          <div className="eyebrow">Built with boundaries</div>
          <h2>Automation should be inspectable.</h2>
          <p>
            Flowwright keeps the path from screen to software visible. Every
            decision can be reviewed, every sensitive action pauses, and every
            demo is validated before it becomes reusable.
          </p>
        </div>
        <div className="safety-list">
          {safetyItems.map(([title, description]) => (
            <div className="safety-item" key={title}>
              <span className="safety-mark">+</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
