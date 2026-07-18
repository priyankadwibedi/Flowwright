const steps = [
  ["01", "Demonstrate", "Capture the task and its explanation."],
  ["02", "Understand", "Identify actions, decisions, variables, and mistakes."],
  ["03", "Generate", "Compile the workflow into structured code."],
  ["04", "Test", "Run expected cases and edge cases."],
  ["05", "Run", "Run the generated application using the validated compiler rules."],
] as const;

export function ProcessSteps() {
  return (
    <section className="process-section" id="process">
      <div className="content-width">
        <div className="eyebrow eyebrow-light">The compiler loop</div>
        <h2>From demonstration to dependable software.</h2>
        <div className="process-grid">
          {steps.map(([number, title, description], index) => (
            <article key={title} className="process-step">
              <div className="process-number">{number}</div>
              <div className="process-line" aria-hidden="true">
                <span className={index === 0 ? "is-active" : ""} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
