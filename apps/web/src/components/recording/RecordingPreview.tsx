export function RecordingPreview({ videoUrl }: { videoUrl: string | null }) {
  if (!videoUrl)
    return (
      <div className="recording-empty">
        <span className="recording-empty-icon">◉</span>
        <strong>Your browser preview appears here</strong>
        <p>
          Screen sharing stays local until you choose to analyze the
          demonstration.
        </p>
      </div>
    );
  return (
    <div className="recording-preview">
      <video
        controls
        src={videoUrl}
        aria-label="Local browser workflow recording preview"
      />
      <a
        className="button button-outline"
        href={videoUrl}
        download="flowwright-recording.webm"
      >
        Download recording <span aria-hidden="true">↓</span>
      </a>
    </div>
  );
}
