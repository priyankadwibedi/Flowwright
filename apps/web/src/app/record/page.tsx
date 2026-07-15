"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { workflowIRSchema } from "@flowwright/workflow-schema";
import { API_URL } from "../../lib/config";

export default function RecordPage() {
  const router = useRouter();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("Ready to record");
  const [seconds, setSeconds] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
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
        audio: true,
      });
      stream.current = display;
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(display);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const url = URL.createObjectURL(
          new Blob(chunks, { type: mediaRecorder.mimeType }),
        );
        setVideoUrl(url);
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
        ) {
          throw new Error("The event log must be a JSON array of objects.");
        }
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
      "Validating the demonstration and compiling a workflow...",
    );
    try {
      const response = await fetch(`${API_URL}/api/v1/workflows/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_description: taskDescription.trim(),
          browser_event_log: browserEventLog,
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

  return (
    <main className="shell">
      <nav className="nav">
        <Link className="mark" href="/">
          flowwright
        </Link>
        <Link href="/workflows/demo">Open demo -&gt;</Link>
      </nav>
      <div className="eyebrow">Demonstrate</div>
      <h1>Record a browser workflow.</h1>
      <p>
        Capture a local screen recording to help Flowwright understand your
        process. Nothing uploads automatically.
      </p>
      <div className="panel">
        <div className="formrow">
          <button
            className="button primary"
            onClick={start}
            disabled={status === "Recording"}
          >
            Start recording
          </button>
          <button
            className="button"
            onClick={stop}
            disabled={status !== "Recording"}
          >
            Stop recording
          </button>
          <span className="status">
            {status} · {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        </div>
        {videoUrl && (
          <>
            <video
              controls
              src={videoUrl}
              style={{ width: "100%", marginTop: 20, borderRadius: 12 }}
            />
            <a
              className="button"
              href={videoUrl}
              download="flowwright-recording.webm"
              style={{ marginTop: 14 }}
            >
              Download recording
            </a>
          </>
        )}
        {videoUrl && (
          <section
            className="panel"
            style={{ marginTop: 24, background: "#f8f7ff" }}
          >
            <div className="eyebrow">Next step</div>
            <h2>Tell Flowwright what you demonstrated.</h2>
            <p>
              The recording stays local. When you choose Analyze demonstration,
              Flowwright sends only this description and the optional event log
              to the API.
            </p>
            <label htmlFor="task-description">
              <strong>Workflow description</strong>
            </label>
            <textarea
              id="task-description"
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
              placeholder="Example: Review an invoice, find its purchase order, and approve matching totals."
            />
            <div className="actions">
              <button
                className="button primary"
                onClick={analyzeDemonstration}
                disabled={analysisStatus === "analyzing"}
              >
                {analysisStatus === "analyzing"
                  ? "Analyzing..."
                  : "Analyze demonstration"}
              </button>
              {analysisStatus === "ready" && (
                <button
                  className="button"
                  onClick={() => router.push("/workflows/demo")}
                >
                  Open compiled workflow
                </button>
              )}
            </div>
            {analysisMessage && (
              <p
                className={`status ${analysisStatus === "error" ? "failed" : analysisStatus === "ready" ? "passed" : ""}`}
              >
                {analysisMessage}
              </p>
            )}
          </section>
        )}
        <hr style={{ margin: "28px 0", borderColor: "var(--line)" }} />
        <label>
          <strong>Optional JSON event log</strong>
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) file.text().then(setEventLog);
            }}
          />
        </label>
        {eventLog && (
          <p>
            Loaded {eventLog.length.toLocaleString()} characters locally. The
            event log will only be sent when you choose Analyze demonstration.
          </p>
        )}
        <div className="notice" style={{ marginTop: 20 }}>
          Do not record passwords, private messages, payment details, or other
          sensitive information. The optional extension ignores password and
          sensitive fields.
        </div>
      </div>
    </main>
  );
}
