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
    [hasRecording, "Screen recording captured"],
    [hasDescription, "Task description added"],
    [hasEvents, "Optional event log attached"],
  ] as const;
  return (
    <div className="recording-checklist">
      <span className="mono-label">Before compiling</span>
      {checks.map(([complete, label]) => (
        <div key={label}>
          <span className={complete ? "check-box is-complete" : "check-box"}>
            {complete ? "✓" : ""}
          </span>
          <span>{label}</span>
          <small>{complete ? "ready" : "optional"}</small>
        </div>
      ))}
    </div>
  );
}
