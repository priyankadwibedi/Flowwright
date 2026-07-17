"use client";

import { useEffect, useState } from "react";
import { API_CONFIGURED, API_URL } from "../../lib/config";

type CapabilityStatus = {
  demo_mode: boolean;
  openai_configured: boolean;
  transcription_enabled: boolean;
  ai_analysis_enabled: boolean;
  can_disable_demo_mode: boolean;
  openai_model_configured: boolean;
  persisted_to_env?: boolean;
};

const emptyStatus: CapabilityStatus = {
  demo_mode: true,
  openai_configured: false,
  transcription_enabled: false,
  ai_analysis_enabled: false,
  can_disable_demo_mode: false,
  openai_model_configured: false,
};

export function DemoModeToggle() {
  const [status, setStatus] = useState<CapabilityStatus>(emptyStatus);
  const [loading, setLoading] = useState(false);
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

  async function toggle(nextEnabled: boolean) {
    if (!API_URL) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/settings/demo-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const payload = (await response.json()) as CapabilityStatus & {
        detail?: string;
      };
      if (!response.ok) {
        setMessage(
          typeof payload.detail === "string"
            ? payload.detail
            : "Could not update demo mode.",
        );
        return;
      }
      setStatus(payload);
      setMessage(
        payload.demo_mode
          ? "Demo mode on — AI analysis stays off; sample demo still works."
          : "Demo mode off — AI analysis is enabled for this backend.",
      );
    } catch {
      setMessage("Could not reach the backend to update demo mode.");
    } finally {
      setLoading(false);
    }
  }

  if (!API_CONFIGURED || !API_URL) {
    return null;
  }

  return (
    <div className="studio-note demo-mode-card">
      <span className="mono-label">Backend / demo mode</span>
      <h3>{status.demo_mode ? "Demo mode is on" : "Demo mode is off"}</h3>
      <p>
        {status.openai_configured
          ? "OpenAI is configured. Turn demo mode off to analyze your own recordings."
          : "Add OPENAI_API_KEY and OPENAI_MODEL in apps/api/.env before you can turn demo mode off."}
      </p>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={status.demo_mode}
          disabled={loading}
          onChange={(event) => {
            const enableDemo = event.target.checked;
            if (!enableDemo && !status.can_disable_demo_mode) {
              setMessage(
                "Configure OPENAI_API_KEY and OPENAI_MODEL first, then turn demo mode off.",
              );
              return;
            }
            void toggle(enableDemo);
          }}
        />
        <span className="toggle-ui" />
        <span>
          FLOWWRIGHT_DEMO_MODE={status.demo_mode ? "true" : "false"}
        </span>
      </label>
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
