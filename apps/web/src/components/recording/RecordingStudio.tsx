"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { workflowIRSchema } from "@flowwright/workflow-schema";
import { API_CONFIGURED, API_URL } from "../../lib/config";
import {
  processedDemonstrationSchema,
  type ProcessedDemonstration,
} from "../../lib/validation";
import { RecordingChecklist } from "./RecordingChecklist";
import { RecordingControls } from "./RecordingControls";
import { RecordingPreview } from "./RecordingPreview";

type ActionStatus = "idle" | "processing" | "ready" | "error";

export function RecordingStudio() {
  const router = useRouter();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("Ready to record");
  const [seconds, setSeconds] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [eventLog, setEventLog] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [spokenExplanation, setSpokenExplanation] = useState(true);
  const [processed, setProcessed] = useState<ProcessedDemonstration | null>(
    null,
  );
  const [processingStatus, setProcessingStatus] =
    useState<ActionStatus>("idle");
  const [analysisStatus, setAnalysisStatus] = useState<ActionStatus>("idle");
  const [message, setMessage] = useState("");

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((track) => track.stop());
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
        audio: spokenExplanation,
      });
      stream.current = display;
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(display);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        setRecordingBlob(blob);
        setVideoUrl(URL.createObjectURL(blob));
        display.getTracks().forEach((track) => track.stop());
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
    }
  }

  function stop() {
    recorder.current?.stop();
    setStatus("Recording ready");
  }

  async function processEvidence() {
    if (!recordingBlob) return;
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
      media.append("file", recordingBlob, "flowwright-recording.webm");
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

  return (
    <main className="studio-page">
      <div className="content-width studio-heading">
        <div>
          <div className="eyebrow">Demonstrate / 01</div>
          <h1>Record a browser workflow.</h1>
          <p>
            Capture the work once. Review evidence. Then explicitly request AI
            inference.
          </p>
        </div>
        <div className="privacy-badge">
          <span>privacy</span>
          <div>
            <strong>Privacy first</strong>
            <small>
              Never record passwords, private messages, or payment details.
            </small>
          </div>
        </div>
      </div>
      <div className="content-width studio-layout">
        <section className="studio-main">
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
                <i className="audio-indicator" /> Audio{" "}
                {spokenExplanation ? "enabled" : "off"}
              </span>
              <span>
                <i className="event-indicator" /> Browser events optional
              </span>
              <span>Media stays local</span>
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
                <span>Include spoken explanation if available</span>
              </label>
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
                    {eventLog.length.toLocaleString()} characters loaded locally
                  </small>
                )}
              </div>
              <div className="compile-actions">
                <button
                  className="button button-outline"
                  onClick={processEvidence}
                  disabled={processingStatus === "processing" || !recordingBlob}
                >
                  {processingStatus === "processing"
                    ? "Processing evidence..."
                    : "Process evidence"}
                </button>
                <button
                  className="button button-amber"
                  onClick={analyzeDemonstration}
                  disabled={analysisStatus === "processing" || !processed}
                >
                  {analysisStatus === "processing"
                    ? "Analyzing..."
                    : "Analyze my demonstration with AI →"}
                </button>
                <Link className="button button-outline" href="/workflows/demo">
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
        <aside className="studio-sidebar">
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
              non-sensitive text fields. It never records password-like inputs.
            </p>
            <a
              href="https://github.com/priyankadwibedi/Flowwright/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              Read the capture guide →
            </a>
          </div>
          <div className="studio-note warning">
            <span className="mono-label">Prototype boundary</span>
            <p>
              AI inference is unavailable without a configured backend and
              OpenAI key. The sample invoice workflow remains available
              separately.
            </p>
          </div>
        </aside>
      </div>
    </main>
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
