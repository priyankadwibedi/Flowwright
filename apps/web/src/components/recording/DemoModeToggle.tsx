"use client";

import { useEffect, useState } from "react";
import { API_CONFIGURED, API_URL } from "../../lib/config";

type CapabilityStatus = {
  demo_mode: boolean;
  openai_configured: boolean;
  transcription_enabled: boolean;
  ai_analysis_enabled: boolean;
  openai_model_configured: boolean;
};

const emptyStatus: CapabilityStatus = {
  demo_mode: true,
  openai_configured: false,
  transcription_enabled: false,
  ai_analysis_enabled: false,
  openai_model_configured: false,
};

export function DemoModeToggle() {
  const [status, setStatus] = useState<CapabilityStatus>(emptyStatus);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!API_CONFIGURED || !API_URL) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/settings`);
        if (!response.ok) return;
        const payload = (await response.json()) as CapabilityStatus;
        if (!cancelled) setStatus(payload);
      } catch {
        if (!cancelled) {
          setMessage("Could not load backend demo-mode status.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!API_CONFIGURED || !API_URL) {
    return null;
  }

  return (
    <div className="studio-note demo-mode-card">
      <span className="mono-label">Backend / demo mode</span>
      <h3>{status.demo_mode ? "Demo mode is on" : "Demo mode is off"}</h3>
      <p>
        {status.openai_configured
          ? "OpenAI is configured. Demo mode is controlled by deployment configuration."
          : "Add OPENAI_API_KEY and OPENAI_MODEL in the backend environment before AI analysis is available."}
      </p>
      <p className="demo-mode-message">
        FLOWWRIGHT_DEMO_MODE={status.demo_mode ? "true" : "false"}
      </p>
      <div className="demo-mode-meta">
        <small>
          OpenAI: {status.openai_configured ? "configured" : "missing"}
        </small>
        <small>
          AI analysis: {status.ai_analysis_enabled ? "enabled" : "disabled"}
        </small>
      </div>
      {message && <p className="demo-mode-message">{message}</p>}
    </div>
  );
}
