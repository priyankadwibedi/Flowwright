"use client";

/* Microphone + screen recording with merged tracks and explicit status UI. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { workflowIRSchema } from "@flowwright/workflow-schema";
import { API_CONFIGURED, API_URL } from "../../lib/config";
import {
  processedDemonstrationSchema,
  type ProcessedDemonstration,
} from "../../lib/validation";
import { storeEvidenceCollection } from "../../lib/evidenceStore";
import { AppContainer } from "../layout/AppContainer";
import { DemoModeToggle } from "./DemoModeToggle";
import { RecordingChecklist } from "./RecordingChecklist";
import { RecordingControls } from "./RecordingControls";
import { RecordingPreview } from "./RecordingPreview";

type ActionStatus = "idle" | "processing" | "ready" | "error";
type TrackStatus = "active" | "unavailable" | "denied" | "off";

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

export function RecordingStudio() {
  const router = useRouter();
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
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
      const displayAudio = display.getAudioTracks();
      setScreenAudioStatus(displayAudio.length ? "active" : "unavailable");

      let micStream: MediaStream | null = null;
      if (spokenExplanation) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          setMicrophoneStatus("active");
        } catch {
          setMicrophoneStatus("denied");
          micStream = null;
        }
      } else {
        setMicrophoneStatus("off");
      }

      // Prefer microphone narration; keep display audio only when mic is unavailable.
      if (micStream?.getAudioTracks().length) {
        tracks.push(...micStream.getAudioTracks());
      } else if (displayAudio.length) {
        tracks.push(...displayAudio);
      } else {
        displayAudio.forEach((track) => track.stop());
      }
      if (micStream?.getAudioTracks().length) {
        displayAudio.forEach((track) => track.stop());
      }

      const combined = new MediaStream(tracks);
      stream.current = combined;
      chunks.current = [];
      const selectedType = pickMimeType();
      mimeType.current = selectedType;
      const mediaRecorder = selectedType
        ? new MediaRecorder(combined, { mimeType: selectedType })
        : new MediaRecorder(combined);
      mimeType.current = mediaRecorder.mimeType || selectedType || "video/webm";

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onerror = () => {
        setStatus("Recorder error");
        setMessage("MediaRecorder reported an error. Recording stopped.");
        stop();
      };
      const videoTrack = combined.getVideoTracks()[0];
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
      setMicrophoneStatus("off");
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
    if (!recordingBlob) return;
    if (!consentUpload) {
      setProcessingStatus("error");
      setMessage("Confirm the privacy disclosure before uploading evidence.");
      return;
    }
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
      // Strip codec parameters so the upload Content-Type is a bare video/webm|mp4.
      const baseType = (recordingBlob.type || "video/webm").split(";", 1)[0].trim();
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
    if (!taskDescription.trim()) {
      setAnalysisStatus("error");
      setMessage("Add a short description of what you demonstrated first.");
      return;
    }
    if (!processed) {
      setAnalysisStatus("error");
      setMessage("Process the evidence before requesting AI inference.");
      return;
    }
    if (!API_CONFIGURED || !API_URL) {
      setAnalysisStatus("error");
      setMessage(
        "AI analysis is unavailable because the production API URL is not configured.",
      );
      return;
    }
    setAnalysisStatus("processing");
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
        throw new Error(
          await describeApiError(response, "AI analysis unavailable"),
        );
      }
      const workflow = workflowIRSchema.parse(await response.json());
      sessionStorage.setItem("flowwright.workflow", JSON.stringify(workflow));
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

  const backendHost = API_URL ? new URL(API_URL).host : "not configured";

  return (
    <div className="studio-page">
      <AppContainer>
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
            <div className="privacy-badge">
              <span>privacy</span>
              <div>
                <strong>Privacy first</strong>
                <small>
                  Never record passwords, private messages, or payment details.
                </small>
              </div>
            </div>
            <RecordingChecklist
              hasRecording={Boolean(videoUrl)}
              hasDescription={Boolean(taskDescription.trim())}
              hasEvents={Boolean(eventLog)}
            />
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
            <DemoModeToggle />
            <div className="studio-note warning">
              <span className="mono-label">Prototype boundary</span>
              <p>
                AI inference is unavailable without a configured backend and
                OpenAI key. The sample invoice workflow remains available
                separately.
              </p>
            </div>
          </aside>

          <section className="record-main">
            <div className="studio-card recording-card">
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
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={spokenExplanation}
                    onChange={(event) =>
                      setSpokenExplanation(event.target.checked)
                    }
                  />
                  <span className="toggle-ui" />
                  <span>Request microphone narration when recording</span>
                </label>
                <div className="privacy-disclosure">
                  <p>
                    Your recording stays local until you choose Process
                    evidence. Processing uploads it temporarily to the
                    configured Flowwright backend. Selected frames and
                    transcript text may be sent to the configured AI provider.
                  </p>
                  <ul>
                    <li>Backend host: {backendHost}</li>
                    <li>
                      Transcription:{" "}
                      {API_CONFIGURED
                        ? "available when API key is set"
                        : "disabled"}
                    </li>
                    <li>
                      AI analysis:{" "}
                      {API_CONFIGURED
                        ? "available when configured"
                        : "disabled"}
                    </li>
                    <li>Media retention: not retained by default</li>
                  </ul>
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
                    onClick={processEvidence}
                    disabled={
                      processingStatus === "processing" ||
                      !recordingBlob ||
                      !consentUpload
                    }
                  >
                    {processingStatus === "processing"
                      ? "Processing evidence..."
                      : "Process evidence"}
                  </button>
                  <button
                    className="button button-outline"
                    onClick={analyzeDemonstration}
                    disabled={analysisStatus === "processing" || !processed}
                  >
                    {analysisStatus === "processing"
                      ? "Analyzing..."
                      : "Analyze my demonstration with AI →"}
                  </button>
                  <Link
                    className="button button-outline"
                    href="/workflows/demo"
                  >
                    Try sample invoice demo
                  </Link>
                  {analysisStatus === "ready" && (
                    <button
                      className="button button-outline"
                      onClick={() => router.push("/workflows/demo")}
                    >
                      Open inferred workflow
                    </button>
                  )}
                </div>
                {message && (
                  <p
                    className={`analysis-message ${analysisStatus === "error" || processingStatus === "error" ? "error" : analysisStatus === "ready" ? "ready" : ""}`}
                  >
                    {message}
                  </p>
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
  const display = await options.getDisplayMedia({ video: true, audio: true });
  const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
  const displayAudio = display.getAudioTracks();
  let screenAudioStatus: TrackStatus = displayAudio.length
    ? "active"
    : "unavailable";
  let microphoneStatus: TrackStatus = "off";
  if (options.spokenExplanation) {
    try {
      const mic = await options.getUserMedia({ audio: true, video: false });
      microphoneStatus = "active";
      tracks.push(...mic.getAudioTracks());
    } catch {
      microphoneStatus = "denied";
      tracks.push(...displayAudio);
    }
  } else {
    tracks.push(...displayAudio);
  }
  return {
    trackKinds: tracks.map((track) => track.kind),
    screenAudioStatus,
    microphoneStatus,
  };
}
