type CaptureEvent = {
  id: string;
  timestamp: string;
  elapsed_ms: number;
  tab_id: number;
  url: string;
  type: "click" | "input" | "navigation" | "submit";
  selector: string;
  element_role: string | null;
  label: string | null;
  value_policy: "omitted" | "masked" | "captured";
  value: string | null;
  description: string | null;
};

type CaptureSession = {
  id: string;
  startedAt: string;
  recording: boolean;
  activeTabIds: number[];
  events: CaptureEvent[];
};

const SESSION_KEY = "captureSession";

async function getSession(): Promise<CaptureSession | null> {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return (data[SESSION_KEY] as CaptureSession | undefined) ?? null;
}

async function setSession(session: CaptureSession | null): Promise<void> {
  if (session === null) {
    await chrome.storage.session.remove(SESSION_KEY);
    return;
  }
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

async function ensureHostPermission(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    return false;
  }
  const origin = new URL(tab.url).origin + "/*";
  const already = await chrome.permissions.contains({ origins: [origin] });
  if (already) return true;
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    if (message?.type === "FLOWWRIGHT_GET_SESSION") {
      sendResponse({ session: await getSession() });
      return;
    }
    if (message?.type === "FLOWWRIGHT_START") {
      const existing = await getSession();
      if (existing?.recording && !message.confirmReset) {
        sendResponse({ needsConfirmation: true, session: existing });
        return;
      }
      const tabId = message.tabId as number;
      const permitted = await ensureHostPermission(tabId);
      if (!permitted) {
        sendResponse({ ok: false, error: "host_permission_denied" });
        return;
      }
      await injectContent(tabId);
      const session: CaptureSession = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        recording: true,
        activeTabIds: [tabId],
        events: [],
      };
      await setSession(session);
      await chrome.tabs.sendMessage(tabId, {
        type: "FLOWWRIGHT_CONTENT_START",
        sessionId: session.id,
        startedAt: session.startedAt,
      });
      sendResponse({ ok: true, session });
      return;
    }
    if (message?.type === "FLOWWRIGHT_STOP") {
      const session = await getSession();
      if (session) {
        session.recording = false;
        await setSession(session);
        for (const tabId of session.activeTabIds) {
          try {
            await chrome.tabs.sendMessage(tabId, { type: "FLOWWRIGHT_CONTENT_STOP" });
          } catch {
            // Tab may be closed.
          }
        }
      }
      sendResponse({ ok: true, session });
      return;
    }
    if (message?.type === "FLOWWRIGHT_EVENT" && sender.tab?.id != null) {
      const session = await getSession();
      if (!session?.recording) {
        sendResponse({ ok: false });
        return;
      }
      const event = message.event as CaptureEvent;
      event.tab_id = sender.tab.id;
      session.events.push(event);
      if (!session.activeTabIds.includes(sender.tab.id)) {
        session.activeTabIds.push(sender.tab.id);
      }
      await setSession(session);
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "FLOWWRIGHT_EXPORT") {
      const session = await getSession();
      sendResponse({ events: session?.events ?? [] });
    }
  })();
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  void (async () => {
    const session = await getSession();
    if (!session?.recording || !session.activeTabIds.includes(tabId)) return;
    if (changeInfo.status === "complete") {
      try {
        await injectContent(tabId);
        await chrome.tabs.sendMessage(tabId, {
          type: "FLOWWRIGHT_CONTENT_START",
          sessionId: session.id,
          startedAt: session.startedAt,
        });
      } catch {
        // Ignore injection failures on restricted pages.
      }
    }
  })();
});
