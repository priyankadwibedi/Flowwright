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
const MAX_EVENTS = 500;
const RESTRICTED_URL_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:"];

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

function isAllowedTabUrl(url: string | undefined): url is string {
  return Boolean(url) && !RESTRICTED_URL_PREFIXES.some((prefix) => url!.startsWith(prefix));
}

async function ensureHostPermission(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if (!isAllowedTabUrl(tab.url)) return false;
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

async function syncContent(tabId: number, session: CaptureSession | null): Promise<void> {
  await injectContent(tabId);
  await chrome.tabs.sendMessage(tabId, {
    type: "FLOWWRIGHT_CONTENT_SYNC",
    session,
  });
}

function normalizeEvent(event: CaptureEvent, tabId: number, url: string | undefined): CaptureEvent {
  return {
    id: String(event.id || crypto.randomUUID()),
    timestamp: String(event.timestamp || new Date().toISOString()),
    elapsed_ms: Math.max(0, Number(event.elapsed_ms) || 0),
    tab_id: tabId,
    url: String(event.url || url || ""),
    type: event.type,
    selector: String(event.selector || "").slice(0, 500),
    element_role: event.element_role ? String(event.element_role).slice(0, 120) : null,
    label: event.label ? String(event.label).slice(0, 120) : null,
    value_policy: event.value_policy,
    value: event.value === null ? null : String(event.value).slice(0, 120),
    description: event.description ? String(event.description).slice(0, 500) : null,
  };
}

async function appendEvent(event: CaptureEvent, tabId: number, url?: string): Promise<boolean> {
  const session = await getSession();
  if (!session?.recording) return false;
  if (!session.activeTabIds.includes(tabId)) {
    session.activeTabIds.push(tabId);
  }
  if (session.events.length >= MAX_EVENTS) {
    session.events = session.events.slice(0, MAX_EVENTS);
    await setSession(session);
    return false;
  }
  session.events.push(normalizeEvent(event, tabId, url));
  if (session.events.length > MAX_EVENTS) {
    session.events = session.events.slice(0, MAX_EVENTS);
  }
  await setSession(session);
  return true;
}

async function appendNavigationEvent(tabId: number, url: string, description: string): Promise<void> {
  const session = await getSession();
  if (!session?.recording || !session.activeTabIds.includes(tabId)) return;
  await appendEvent(
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      elapsed_ms: Math.max(0, Date.now() - Date.parse(session.startedAt)),
      tab_id: tabId,
      url,
      type: "navigation",
      selector: "window",
      element_role: null,
      label: "navigation",
      value_policy: "omitted",
      value: null,
      description,
    },
    tabId,
    url,
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    if (message?.type === "FLOWWRIGHT_GET_SESSION") {
      sendResponse({ session: await getSession() });
      return;
    }
    if (message?.type === "FLOWWRIGHT_CONTENT_READY" && sender.tab?.id != null) {
      const session = await getSession();
      if (session?.recording && !session.activeTabIds.includes(sender.tab.id)) {
        session.activeTabIds.push(sender.tab.id);
        await setSession(session);
      }
      sendResponse({ session });
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
      const session: CaptureSession = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        recording: true,
        activeTabIds: [tabId],
        events: [],
      };
      await setSession(session);
      await syncContent(tabId, session);
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
            await chrome.tabs.sendMessage(tabId, {
              type: "FLOWWRIGHT_CONTENT_SYNC",
              session,
            });
          } catch {
            // Tab may be closed.
          }
        }
      }
      sendResponse({ ok: true, session });
      return;
    }
    if (message?.type === "FLOWWRIGHT_EVENT" && sender.tab?.id != null) {
      const ok = await appendEvent(
        message.event as CaptureEvent,
        sender.tab.id,
        sender.tab.url,
      );
      sendResponse({ ok });
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
    if (changeInfo.url && isAllowedTabUrl(changeInfo.url)) {
      await appendNavigationEvent(tabId, changeInfo.url, `navigation ${changeInfo.url}`);
    }
    if (changeInfo.status === "complete") {
      try {
        await syncContent(tabId, await getSession());
      } catch {
        // Ignore injection failures on restricted pages.
      }
    }
  })();
});
