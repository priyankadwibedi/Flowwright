"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { workflowIRSchema } from "@flowwright/workflow-schema";
import { API_URL } from "../../lib/config";
import { RecordingChecklist } from "./RecordingChecklist";
import { RecordingControls } from "./RecordingControls";
import { RecordingPreview } from "./RecordingPreview";

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
  const [analysisStatus, setAnalysisStatus] = useState<
    "idle" | "analyzing" | "ready" | "error"
  >("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");

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
      setAnalysisStatus("idle");
      setAnalysisMessage("");
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

  async function analyzeDemonstration() {
    if (!taskDescription.trim()) {
      setAnalysisStatus("error");
      setAnalysisMessage(
        "Add a short description of what you demonstrated first.",
      );
      return;
    }
    let browserEventLog: Record<string, unknown>[] | undefined;
    if (eventLog) {
      try {
        const parsed: unknown = JSON.parse(eventLog);
        if (
          !Array.isArray(parsed) ||
          parsed.some(
            (item) => !item || typeof item !== "object" || Array.isArray(item),
          )
        )
          throw new Error("The event log must be a JSON array of objects.");
        browserEventLog = parsed as Record<string, unknown>[];
      } catch (error) {
        setAnalysisStatus("error");
        setAnalysisMessage(
          error instanceof Error
            ? error.message
            : "The event log is not valid JSON.",
        );
        return;
      }
    }
    setAnalysisStatus("analyzing");
    setAnalysisMessage(
      "Extracting temporary key frames and compiling a workflow...",
    );
    try {
      let screenshots: string[] | undefined;
      if (recordingBlob) {
        const media = new FormData();
        media.append("file", recordingBlob, "flowwright-recording.webm");
        const keyframeResponse = await fetch(
          `${API_URL}/api/v1/media/keyframes`,
          { method: "POST", body: media },
        );
        if (keyframeResponse.ok) {
          const payload: { frames?: unknown[] } = await keyframeResponse.json();
          screenshots = (payload.frames ?? []).map((frame) =>
            JSON.stringify(frame),
          );
        } else
          setAnalysisMessage(
            "Key-frame extraction was unavailable; compiling from the description and event log...",
          );
      }
      const response = await fetch(`${API_URL}/api/v1/workflows/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_description: taskDescription.trim(),
          browser_event_log: browserEventLog,
          screenshots,
          transcript: spokenExplanation
            ? "Spoken explanation included in recording"
            : undefined,
        }),
      });
      if (!response.ok)
        throw new Error(
          `Analysis failed (${response.status}). Is the API running?`,
        );
      const workflow = workflowIRSchema.parse(await response.json());
      sessionStorage.setItem("flowwright.workflow", JSON.stringify(workflow));
      setAnalysisStatus("ready");
      setAnalysisMessage(
        "Workflow compiled. Open it to inspect the graph, decisions, and approval gates.",
      );
    } catch (error) {
      setAnalysisStatus("error");
      setAnalysisMessage(
        error instanceof Error
          ? error.message
          : "The workflow could not be compiled.",
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
  }

  return (
    <main className="studio-page">
      <div className="content-width studio-heading">
        <div>
          <div className="eyebrow">Demonstrate / 01</div>
          <h1>Record a browser workflow.</h1>
          <p>
            Capture the work once. Keep the recording local. Then choose exactly
            when Flowwright should compile it into a validated workflow.
          </p>
        </div>
        <div className="privacy-badge">
          <span>◎</span>
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
                  <span className="mono-label">Next step</span>
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
                  className="button button-amber"
                  onClick={analyzeDemonstration}
                  disabled={analysisStatus === "analyzing"}
                >
                  {analysisStatus === "analyzing"
                    ? "Analyzing..."
                    : "Analyze demonstration →"}
                </button>
                {analysisStatus === "ready" && (
                  <button
                    className="button button-outline"
                    onClick={() => router.push("/workflows/demo")}
                  >
                    Open compiled workflow
                  </button>
                )}
              </div>
              {analysisMessage && (
                <p className={`analysis-message ${analysisStatus}`}>
                  {analysisMessage}
                </p>
              )}
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
              The Chrome extension can add clicks, navigation, and non-sensitive
              text fields. It never records password-like inputs.
            </p>
            <a
              href="https://github.com/priyankadwibedi/Flowwright/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              Read the capture guide ↗
            </a>
          </div>
          <div className="studio-note warning">
            <span className="mono-label">Prototype boundary</span>
            <p>
              Flowwright currently compiles controlled browser workflows only.
              Sensitive actions pause for human approval.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
