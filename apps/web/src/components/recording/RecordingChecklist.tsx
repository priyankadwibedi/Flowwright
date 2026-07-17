export function RecordingChecklist({
  hasRecording,
  hasDescription,
  hasEvents,
}: {
  hasRecording: boolean;
  hasDescription: boolean;
  hasEvents: boolean;
}) {
  const checks = [
    [hasRecording, "Screen recording captured", true],
    [hasDescription, "Task description added", true],
    [hasEvents, "Event log attached", false],
  ] as const;
  return (
    <div className="recording-checklist">
      <span className="mono-label">Before compiling</span>
      {checks.map(([complete, label, required]) => (
        <div key={label}>
          <span className={complete ? "check-box is-complete" : "check-box"}>
            {complete ? "✓" : ""}
          </span>
          <span>{label}</span>
          <small>{complete ? "ready" : required ? "required" : "optional"}</small>
        </div>
      ))}
    </div>
  );
}
