"use client";

/* Microphone + screen recording with merged tracks and explicit status UI. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { workflowIRSchema } from "@flowwright/workflow-schema";
import { API_CONFIGURED, API_URL } from "../../lib/config";
import {
  buildCombinedRecordingStream,
  composeRecordingTracks,
  type TrackStatus,
} from "../../lib/recordingStreams";
import {
  processedDemonstrationSchema,
  type ProcessedDemonstration,
} from "../../lib/validation";
import { storeEvidenceCollection } from "../../lib/evidenceStore";
import { saveInferredWorkflow } from "../../lib/workflowSession";
import { AppContainer } from "../layout/AppContainer";
import {
  BackendCapabilityStatus,
  useBackendCapabilities,
} from "./BackendCapabilityStatus";
import { BackLink } from "../navigation/BackLink";
import { RecordingChecklist } from "./RecordingChecklist";
import { RecordingControls } from "./RecordingControls";
import { RecordingPreview } from "./RecordingPreview";
import { routes } from "../../lib/routes";

type ActionStatus = "idle" | "processing" | "ready" | "error";

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "";
}

function processEvidenceReadiness(input: {
  hasRecording: boolean;
  hasDescription: boolean;
  hasConsent: boolean;
}): string {
  if (!input.hasRecording) return "Record or upload a demonstration first.";
  if (!input.hasDescription) return "Add a short description of the workflow.";
  if (!input.hasConsent) return "Confirm the processing disclosure.";
  return "Ready to process evidence.";
}

export function RecordingStudio() {
  const router = useRouter();
  const capabilities = useBackendCapabilities();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mimeType = useRef<string>("");
  const [status, setStatus] = useState("Ready to record");
  const [seconds, setSeconds] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [eventLog, setEventLog] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [spokenExplanation, setSpokenExplanation] = useState(true);
  const [consentUpload, setConsentUpload] = useState(false);
  const [screenAudioStatus, setScreenAudioStatus] =
    useState<TrackStatus>("off");
  const [microphoneStatus, setMicrophoneStatus] = useState<TrackStatus>("off");
  const [processed, setProcessed] = useState<ProcessedDemonstration | null>(
    null,
  );
  const [processingStatus, setProcessingStatus] =
    useState<ActionStatus>("idle");
  const [analysisStatus, setAnalysisStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");
  const [analysisErrorTitle, setAnalysisErrorTitle] = useState<string | null>(
    null,
  );
  const [analysisTechnicalDetails, setAnalysisTechnicalDetails] = useState<
    string | null
  >(null);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);

  const isRecording = status === "Recording";
  const aiAnalysisEnabled =
    capabilities.kind === "ready" && capabilities.status.ai_analysis_enabled;
  const processReadyMessage = processEvidenceReadiness({
    hasRecording: Boolean(recordingBlob),
    hasDescription: Boolean(taskDescription.trim()),
    hasConsent: consentUpload,
  });
  const canProcessEvidence =
    Boolean(recordingBlob) &&
    Boolean(taskDescription.trim()) &&
    consentUpload &&
    processingStatus !== "processing";
  const canInferWorkflow =
    Boolean(processed) &&
    API_CONFIGURED &&
    Boolean(API_URL) &&
    aiAnalysisEnabled &&
    analysisStatus !== "processing";

  function stopAllTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  useEffect(
    () => () => {
      stopAllTracks();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => {
    if (status !== "Recording") return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  async function start() {
    try {
      const combined = await buildCombinedRecordingStream({
        wantMicrophone: spokenExplanation,
        getDisplayMedia: navigator.mediaDevices.getDisplayMedia.bind(
          navigator.mediaDevices,
        ),
        getUserMedia: navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        ),
      });
      stream.current = combined.stream;
      setScreenAudioStatus(combined.screenAudioStatus);
      setMicrophoneStatus(combined.microphoneStatus);

      const initialScreenActive = combined.screenAudioStatus === "active";
      const initialMicActive = combined.microphoneStatus === "active";
      for (const track of combined.stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          const liveAudio = combined.stream
            .getAudioTracks()
            .filter((item) => item.readyState === "live");
          if (initialMicActive) {
            setMicrophoneStatus(liveAudio.length ? "active" : "unavailable");
          }
          if (initialScreenActive) {
            setScreenAudioStatus(liveAudio.length ? "active" : "unavailable");
          }
        });
      }

      chunks.current = [];
      const selectedType = pickMimeType();
      mimeType.current = selectedType;
      const mediaRecorder = selectedType
        ? new MediaRecorder(combined.stream, { mimeType: selectedType })
        : new MediaRecorder(combined.stream);
      mimeType.current = mediaRecorder.mimeType || selectedType || "video/webm";

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onerror = () => {
        setStatus("Recorder error");
        setMessage("MediaRecorder reported an error. Recording stopped.");
        stop();
      };
      const videoTrack = combined.stream.getVideoTracks()[0];
      videoTrack?.addEventListener("ended", () => {
        setMessage("Shared screen ended. Recording stopped.");
        stop();
      });
      mediaRecorder.onstop = () => {
        const type = mimeType.current || "video/webm";
        const blob = new Blob(chunks.current, { type });
        stopAllTracks();
        if (!blob.size) {
          setRecordingBlob(null);
          setVideoUrl(null);
          setStatus("Empty recording discarded");
          setMessage(
            "Recording produced no media. Start again and keep the shared screen open.",
          );
          return;
        }
        setRecordingBlob(blob);
        setVideoUrl(URL.createObjectURL(blob));
        setStatus("Recording ready");
      };
      recorder.current = mediaRecorder;
      setSeconds(0);
      setProcessed(null);
      setProcessingStatus("idle");
      setAnalysisStatus("idle");
      setMessage("");
      setStatus("Recording");
      mediaRecorder.start(250);
    } catch {
      setStatus("Screen sharing was cancelled or unavailable");
      setScreenAudioStatus("off");
      setMicrophoneStatus(spokenExplanation ? "off" : "off");
    }
  }

  function stop() {
    const active = recorder.current;
    if (active && active.state !== "inactive") {
      try {
        if (active.state === "recording") {
          active.requestData();
        }
      } catch {
        // Some browsers reject requestData outside an active recording state.
      }
      active.stop();
    } else {
      stopAllTracks();
      setStatus("Recording ready");
    }
  }

  async function processEvidence() {
    if (!recordingBlob || !taskDescription.trim() || !consentUpload) return;
    if (!API_CONFIGURED || !API_URL) {
      setProcessingStatus("error");
      setMessage(
        "Evidence processing is unavailable because the backend URL is not configured.",
      );
      return;
    }
    setProcessingStatus("processing");
    setMessage(
      "Extracting real JPEG frames and synchronizing browser evidence...",
    );
    try {
      const media = new FormData();
      const baseType = (recordingBlob.type || "video/webm")
        .split(";", 1)[0]
        .trim();
      const extension = baseType.includes("mp4")
        ? "mp4"
        : baseType.includes("quicktime")
          ? "mov"
          : "webm";
      const uploadType =
        baseType === "video/mp4" || baseType === "video/quicktime"
          ? baseType
          : "video/webm";
      const uploadBlob = new Blob([recordingBlob], { type: uploadType });
      media.append(
        "file",
        uploadBlob,
        `flowwright-recording.${extension}`,
      );
      if (eventLog) media.append("event_log", eventLog);
      media.append("task_description", taskDescription.trim());
      const response = await fetch(
        `${API_URL}/api/v1/media/process-demonstration`,
        {
          method: "POST",
          body: media,
        },
      );
      if (!response.ok) {
        throw new Error(
          await describeApiError(response, "Evidence processing failed"),
        );
      }
      const payload = processedDemonstrationSchema.parse(await response.json());
      await storeEvidenceCollection(payload);
      setProcessed(payload);
      setProcessingStatus("ready");
      setMessage(
        "Evidence is ready for review. AI inference remains a separate explicit action.",
      );
    } catch (error) {
      setProcessingStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Evidence processing failed.",
      );
    }
  }

  async function analyzeDemonstration() {
    if (!canInferWorkflow || !processed || !API_URL) return;
    setAnalysisStatus("processing");
    setAnalysisErrorTitle(null);
    setAnalysisTechnicalDetails(null);
    setShowAnalysisDetails(false);
    setMessage("Sending reviewed evidence to the configured AI analyzer...");
    try {
      const response = await fetch(`${API_URL}/api/v1/workflows/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_description: taskDescription.trim(),
          processed_demonstration: processed,
          transcript: processed.transcript || undefined,
        }),
      });
      if (!response.ok) {
        const parsed = await parseAnalysisError(response);
        if (parsed.kind === "validation") {
          setAnalysisStatus("error");
          setAnalysisErrorTitle("Workflow validation failed");
          setAnalysisTechnicalDetails(parsed.technical);
          setMessage(
            "Flowwright inferred the workflow, but one evidence reference could not be normalized. Retry the analysis or review the technical details.",
          );
          return;
        }
        throw new Error(parsed.technical);
      }
      const workflow = workflowIRSchema.parse(await response.json());
      saveInferredWorkflow(workflow);
      if (processed.demonstration_id) {
        sessionStorage.setItem(
          "flowwright.demonstration_id",
          processed.demonstration_id,
        );
      }
      setAnalysisStatus("ready");
      setMessage(
        "Workflow inferred. Open it to inspect provenance, decisions, and approval gates.",
      );
    } catch (error) {
      setAnalysisStatus("error");
      setAnalysisErrorTitle(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The workflow could not be inferred.",
      );
    }
  }

  function uploadExisting() {
    document.getElementById("existing-recording")?.click();
  }

  function onExistingRecording(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setRecordingBlob(file);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setStatus("Recording ready");
    setProcessed(null);
    setProcessingStatus("idle");
  }

  const inferDisabledReason =
    capabilities.kind === "loading"
      ? "Checking backend capabilities…"
      : capabilities.kind === "unavailable" || !API_CONFIGURED || !API_URL
        ? "Processing backend unavailable."
        : !aiAnalysisEnabled
          ? "Live AI inference is unavailable on this deployment. Use the sample invoice workflow or enable the AI backend."
          : !processed
            ? "Process evidence before requesting AI inference."
            : null;

  return (
    <div className="studio-page">
      <AppContainer>
        <BackLink href={routes.home} label="Back to home" />
        <header className="record-intro">
          <div className="eyebrow">Demonstrate / 01</div>
          <h1>Record the task once.</h1>
          <p>
            Demonstrate the process naturally. Flowwright will extract the
            actions, decisions, variables, and exceptions before compiling the
            workflow.
          </p>
        </header>

        <div className="record-layout">
          <aside className="record-context">
            <RecordingChecklist
              hasRecording={Boolean(videoUrl)}
              hasDescription={Boolean(taskDescription.trim())}
              hasEvents={Boolean(eventLog)}
            />
            <BackendCapabilityStatus state={capabilities} />
            <div className="studio-note">
              <span className="mono-label">Optional extension</span>
              <h3>Capture safer browser events.</h3>
              <p>
                The Chrome extension can add clicks, navigation, submits, and
                non-sensitive text fields. It never records password-like
                inputs.
              </p>
              <a
                href="https://github.com/priyankadwibedi/Flowwright/tree/main/docs"
                target="_blank"
                rel="noreferrer"
              >
                Read the capture guide →
              </a>
            </div>
            <div className="privacy-badge">
              <span>privacy</span>
              <div>
                <strong>Privacy reminder</strong>
                <small>
                  Never record passwords, private messages, or payment details.
                  Upload begins only after Process evidence.
                </small>
              </div>
            </div>
          </aside>

          <section className="record-main">
            <div className="studio-card recording-card" id="recording-card">
              <div className="studio-card-header">
                <div>
                  <span className="mono-label">Screen capture</span>
                  <h2>Show Flowwright how the task works.</h2>
                </div>
                <span className="browser-status">
                  <i /> Browser workflow
                </span>
              </div>
              <RecordingPreview videoUrl={videoUrl} />
              <label className="toggle-row mic-choice">
                <input
                  type="checkbox"
                  checked={spokenExplanation}
                  disabled={isRecording}
                  onChange={(event) =>
                    setSpokenExplanation(event.target.checked)
                  }
                />
                <span className="toggle-ui" />
                <span>
                  Include microphone narration
                  {spokenExplanation
                    ? microphoneStatus === "denied"
                      ? " · permission denied"
                      : microphoneStatus === "active"
                        ? " · permission granted"
                        : microphoneStatus === "unavailable"
                          ? " · unavailable"
                          : " · will request permission"
                    : " · off"}
                </span>
              </label>
              <RecordingControls
                status={status}
                seconds={seconds}
                onStart={start}
                onStop={stop}
                onUpload={uploadExisting}
              />
              <input
                id="existing-recording"
                className="visually-hidden"
                type="file"
                accept="video/*"
                onChange={onExistingRecording}
              />
              <div className="capture-metadata">
                <span>
                  <i className="audio-indicator" /> Screen audio:{" "}
                  {screenAudioStatus}
                </span>
                <span>
                  <i className="event-indicator" /> Microphone:{" "}
                  {microphoneStatus}
                </span>
                <span>Browser events optional</span>
              </div>
            </div>

            {videoUrl && (
              <section className="studio-card compile-card">
                <div className="studio-card-header">
                  <div>
                    <span className="mono-label">Evidence / inference</span>
                    <h2>Describe what should repeat.</h2>
                  </div>
                  <span className="compile-number">02</span>
                </div>
                <label htmlFor="task-description">Workflow description</label>
                <textarea
                  id="task-description"
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  placeholder="Review an invoice, find its purchase order, and approve matching totals."
                />
                <div className="privacy-disclosure">
                  <p>
                    Your recording stays local until you select Process
                    evidence. Processing temporarily uploads it to the
                    configured backend. Selected frames and transcript text may
                    later be sent to the configured AI provider when you request
                    AI inference.
                  </p>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={consentUpload}
                      onChange={(event) =>
                        setConsentUpload(event.target.checked)
                      }
                    />
                    <span className="toggle-ui" />
                    <span>
                      I understand this upload and consent to process evidence
                    </span>
                  </label>
                  <a
                    href="https://github.com/priyankadwibedi/Flowwright/blob/main/SECURITY.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy and security documentation →
                  </a>
                </div>
                <div className="event-upload">
                  <label htmlFor="event-log">Optional JSON event log</label>
                  <input
                    id="event-log"
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) file.text().then(setEventLog);
                    }}
                  />
                  {eventLog && (
                    <small>
                      {eventLog.length.toLocaleString()} characters loaded
                      locally
                    </small>
                  )}
                </div>
                <div className="compile-actions">
                  <button
                    className="button button-amber"
                    onClick={() => void processEvidence()}
                    disabled={!canProcessEvidence}
                  >
                    {processingStatus === "processing"
                      ? "Processing evidence..."
                      : "Process evidence"}
                  </button>
                  <p className="action-prerequisite">{processReadyMessage}</p>
                  <button
                    className="button button-outline"
                    onClick={() => void analyzeDemonstration()}
                    disabled={!canInferWorkflow}
                  >
                    {analysisStatus === "processing"
                      ? "Inferring…"
                      : analysisStatus === "error" && analysisErrorTitle
                        ? "Retry AI inference"
                        : "Infer workflow with AI"}
                  </button>
                  {inferDisabledReason && (
                    <p className="action-prerequisite">{inferDisabledReason}</p>
                  )}
                  <Link
                    className="button button-outline"
                    href="/workflows/demo"
                  >
                    Open sample invoice workflow
                  </Link>
                  {analysisStatus === "ready" && (
                    <button
                      className="button button-outline"
                      onClick={() => router.push("/workflows/inferred")}
                    >
                      Open inferred workflow
                    </button>
                  )}
                </div>
                {message && (
                  <div
                    className={`analysis-message ${analysisStatus === "error" || processingStatus === "error" ? "error" : analysisStatus === "ready" ? "ready" : ""}`}
                  >
                    {analysisErrorTitle && <strong>{analysisErrorTitle}</strong>}
                    <p>{message}</p>
                    {analysisTechnicalDetails && (
                      <>
                        <button
                          className="button button-outline"
                          type="button"
                          onClick={() =>
                            setShowAnalysisDetails((current) => !current)
                          }
                        >
                          {showAnalysisDetails
                            ? "Hide technical details"
                            : "Show technical details"}
                        </button>
                        {showAnalysisDetails && (
                          <pre className="analysis-technical-details">
                            {analysisTechnicalDetails}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                )}
                {processed && <EvidenceReview processed={processed} />}
              </section>
            )}
          </section>
        </div>
      </AppContainer>
    </div>
  );
}

type ParsedAnalysisError = {
  kind: "validation" | "other";
  technical: string;
};

async function parseAnalysisError(
  response: Response,
): Promise<ParsedAnalysisError> {
  try {
    const payload = (await response.json()) as {
      detail?:
        | string
        | {
            code?: string;
            message?: string;
            issues?: Array<{
              step_id?: string | null;
              reference?: string | null;
              expected_location?: string | null;
              message?: string | null;
            }>;
          };
    };
    const detail = payload.detail;
    if (detail && typeof detail === "object") {
      const code = detail.code ?? "";
      const isValidation =
        response.status === 422 &&
        (code.includes("validation") ||
          code.includes("reference") ||
          Boolean(detail.issues?.length));
      const issueLines = (detail.issues ?? [])
        .map((issue) => {
          const parts = [
            issue.step_id ? `step=${issue.step_id}` : null,
            issue.reference ? `ref=${issue.reference}` : null,
            issue.expected_location
              ? `expected=${issue.expected_location}`
              : null,
            issue.message ?? null,
          ].filter(Boolean);
          return parts.join(" · ");
        })
        .filter(Boolean);
      const technical = [
        detail.message ?? "Workflow validation failed",
        ...issueLines,
      ].join("\n");
      return {
        kind: isValidation ? "validation" : "other",
        technical,
      };
    }
    if (typeof detail === "string" && detail) {
      const looksLikeReference =
        /unknown input|evidence|input_ref|frame-/i.test(detail);
      return {
        kind: response.status === 422 && looksLikeReference
          ? "validation"
          : "other",
        technical:
          response.status === 422 && looksLikeReference
            ? detail
            : `Request failed (${response.status}): ${detail}`,
      };
    }
  } catch {
    // Keep the status-based fallback when the server did not return JSON.
  }
  return {
    kind: "other",
    technical: `Request failed (${response.status})`,
  };
}

async function describeApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail) {
      return `${fallback} (${response.status}): ${payload.detail}`;
    }
  } catch {
    // Keep the status-based fallback when the server did not return JSON.
  }
  return `${fallback} (${response.status})`;
}

function EvidenceReview({ processed }: { processed: ProcessedDemonstration }) {
  return (
    <div className="evidence-review" aria-live="polite">
      <BackLink href={`${routes.record}#recording-card`} label="Back to recording" />
      <div className="evidence-review-header">
        <span className="mono-label">Evidence review</span>
        <span>
          {processed.duration_seconds.toFixed(1)}s ·{" "}
          {processed.evidence_timeline.length} items
        </span>
      </div>
      <div className="frame-strip">
        {processed.frames.map((frame) => (
          <figure key={frame.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${frame.mime_type};base64,${frame.image_base64}`}
              alt={`Captured frame at ${frame.timestamp_seconds.toFixed(1)} seconds`}
            />
            <figcaption>{frame.timestamp_seconds.toFixed(1)}s</figcaption>
          </figure>
        ))}
      </div>
      <div className="transcript-panel">
        <span className="mono-label">Transcript</span>
        <p>
          {processed.transcript ||
            "Transcription unavailable. No placeholder transcript was inserted."}
        </p>
        <small>
          {processed.transcription_status} · audio {processed.audio_status}
        </small>
      </div>
      <div className="evidence-timeline">
        {processed.evidence_timeline.slice(0, 16).map((item) => (
          <div key={item.id}>
            <span>{item.timestamp_seconds.toFixed(1)}s</span>
            <b>{item.source}</b>
            <p>{item.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function mergeRecordingTracksForTest(options: {
  spokenExplanation: boolean;
  getDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia;
  getUserMedia: typeof navigator.mediaDevices.getUserMedia;
}): Promise<{
  trackKinds: string[];
  screenAudioStatus: TrackStatus;
  microphoneStatus: TrackStatus;
}> {
  const result = await buildCombinedRecordingStream({
    wantMicrophone: options.spokenExplanation,
    getDisplayMedia: options.getDisplayMedia,
    getUserMedia: options.getUserMedia,
  });
  return {
    trackKinds: result.stream.getTracks().map((track) => track.kind),
    screenAudioStatus: result.screenAudioStatus,
    microphoneStatus: result.microphoneStatus,
  };
}

export { composeRecordingTracks };
