type RecordingControlsProps = {
  status: string;
  seconds: number;
  onStart: () => void;
  onStop: () => void;
  onUpload: () => void;
  disabled?: boolean;
};

export function RecordingControls({
  status,
  seconds,
  onStart,
  onStop,
  onUpload,
  disabled = false,
}: RecordingControlsProps) {
  const active = status === "Recording";
  return (
    <div className="recording-controls">
      <div className="recording-state">
        <span className={active ? "recording-dot is-live" : "recording-dot"} />{" "}
        <span>{status}</span>
        <strong>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </strong>
      </div>
      <div className="recording-actions">
        <button
          className="button button-amber"
          onClick={onStart}
          disabled={active || disabled}
        >
          Start recording <span aria-hidden="true">↗</span>
        </button>
        <button
          className="button button-dark"
          onClick={onStop}
          disabled={!active}
        >
          Stop recording
        </button>
        <button
          className="button button-outline"
          onClick={onUpload}
          disabled={active}
        >
          Upload existing recording
        </button>
      </div>
    </div>
  );
}
