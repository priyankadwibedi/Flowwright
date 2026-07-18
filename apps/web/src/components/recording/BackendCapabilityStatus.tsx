"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_CONFIGURED, API_URL } from "../../lib/config";

export type CapabilityStatus = {
  demo_mode: boolean;
  openai_configured: boolean;
  transcription_enabled: boolean;
  ai_analysis_enabled: boolean;
  can_disable_demo_mode?: boolean;
  openai_model_configured?: boolean;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; status: CapabilityStatus };

export function useBackendCapabilities(): LoadState {
  const [state, setState] = useState<LoadState>(
    API_CONFIGURED && API_URL
      ? { kind: "loading" }
      : { kind: "unavailable" },
  );

  useEffect(() => {
    if (!API_CONFIGURED || !API_URL) {
      setState({ kind: "unavailable" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/settings`);
        if (!response.ok) {
          if (!cancelled) setState({ kind: "unavailable" });
          return;
        }
        const payload = (await response.json()) as CapabilityStatus;
        if (!cancelled) setState({ kind: "ready", status: payload });
      } catch {
        if (!cancelled) setState({ kind: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function BackendCapabilityStatus({
  state,
}: {
  state: LoadState;
}) {
  if (state.kind === "loading") {
    return (
      <div className="studio-note capability-card" aria-busy="true">
        <span className="mono-label">Backend status</span>
        <h3>Checking backend…</h3>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="studio-note capability-card">
        <span className="mono-label">Backend status</span>
        <h3>Processing backend unavailable</h3>
        <p>You can still explore the sample invoice workflow.</p>
        <ul className="capability-status-list">
          <li>
            <span>Backend</span>
            <b>Unavailable</b>
          </li>
          <li>
            <span>Sample compiler</span>
            <b>Ready</b>
          </li>
          <li>
            <span>Live AI inference</span>
            <b>Unavailable</b>
          </li>
        </ul>
        <Link className="capability-link" href="/workflows/demo">
          Open sample invoice workflow
        </Link>
      </div>
    );
  }

  const { status } = state;
  if (status.ai_analysis_enabled) {
    return (
      <div className="studio-note capability-card">
        <span className="mono-label">Backend status</span>
        <h3>AI mode ready</h3>
        <p>
          Recording analysis, transcription, and workflow inference are
          available.
        </p>
        <ul className="capability-status-list">
          <li>
            <span>Backend</span>
            <b>Connected</b>
          </li>
          <li>
            <span>Transcription</span>
            <b>{status.transcription_enabled ? "Ready" : "Unavailable"}</b>
          </li>
          <li>
            <span>AI workflow inference</span>
            <b>Ready</b>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="studio-note capability-card">
      <span className="mono-label">Backend status</span>
      <h3>Sample mode</h3>
      <p>
        Explore the complete invoice compiler using synthetic data. Live AI
        inference is currently disabled on this deployment.
      </p>
      <ul className="capability-status-list">
        <li>
          <span>Backend</span>
          <b>Connected</b>
        </li>
        <li>
          <span>Sample compiler</span>
          <b>Ready</b>
        </li>
        <li>
          <span>Live AI inference</span>
          <b>Unavailable</b>
        </li>
      </ul>
      <Link className="capability-link" href="/workflows/demo">
        Open sample invoice workflow
      </Link>
    </div>
  );
}
