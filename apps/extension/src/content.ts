import { isSensitiveFieldLike } from "./sensitive";

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

type ContentState = {
  installed: boolean;
  capturing: boolean;
  sessionId: string | null;
  startedAtMs: number;
  indicator: HTMLDivElement | null;
  inputTimers: Map<string, number>;
  lastUrl: string;
  originalPushState?: History["pushState"];
  originalReplaceState?: History["replaceState"];
};

const STATE_KEY = "__flowwrightContentState__";
const INPUT_DEBOUNCE_MS = 350;

const state: ContentState =
  ((globalThis as Record<string, unknown>)[STATE_KEY] as ContentState | undefined) ??
  {
    installed: false,
    capturing: false,
    sessionId: null,
    startedAtMs: 0,
    indicator: null,
    inputTimers: new Map<string, number>(),
    lastUrl: location.href,
  };
(globalThis as Record<string, unknown>)[STATE_KEY] = state;

function escapeCss(value: string): string {
  if (typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\#.:,[\]>+~*]/g, "\\$&");
}

function ensureIndicator(): void {
  if (state.indicator || !document.documentElement) return;
  const indicator = document.createElement("div");
  indicator.id = "flowwright-recording-indicator";
  indicator.textContent = "Flowwright recording";
  indicator.style.cssText =
    "position:fixed;z-index:2147483647;top:8px;right:8px;background:#111;color:#fff;padding:6px 10px;font:12px/1.2 sans-serif;border-radius:4px;opacity:0.85;pointer-events:none;";
  document.documentElement.appendChild(indicator);
  state.indicator = indicator;
}

function removeIndicator(): void {
  state.indicator?.remove();
  state.indicator = null;
}

function setCapturing(session: CaptureSession | null): void {
  state.capturing = Boolean(session?.recording);
  state.sessionId = session?.id ?? null;
  state.startedAtMs = session?.startedAt ? Date.parse(session.startedAt) : Date.now();
  if (state.capturing) {
    document.documentElement.dataset.flowwrightRecording = "true";
    ensureIndicator();
  } else {
    delete document.documentElement.dataset.flowwrightRecording;
    removeIndicator();
  }
}

function cssSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `${tag}#${escapeCss(element.id)}`;
  const testId =
    element.getAttribute("data-testid") ||
    element.getAttribute("data-test") ||
    element.getAttribute("data-cy");
  if (testId) return `${tag}[data-testid="${escapeCss(testId)}"]`;
  const name = element.getAttribute("name");
  if (name) return `${tag}[name="${escapeCss(name)}"]`;
  const aria = element.getAttribute("aria-label");
  if (aria && aria.length <= 80) return `${tag}[aria-label="${escapeCss(aria)}"]`;
  const parent = element.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter(
    (child) => child.tagName === element.tagName,
  );
  const index = siblings.indexOf(element) + 1;
  return siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
}

function isFormField(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

function isSensitiveField(element: Element): boolean {
  if (!isFormField(element)) {
    return element.getAttribute("data-flowwright-sensitive") === "true";
  }
  return isSensitiveFieldLike({
    type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
    name: element.name,
    id: element.id,
    autocomplete: element.autocomplete,
    placeholder: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : "",
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    dataFlowwrightSensitive: element.getAttribute("data-flowwright-sensitive"),
    dataSensitive: element.getAttribute("data-sensitive"),
  });
}

function roleFor(element: Element): string | null {
  return element.getAttribute("role") || element.tagName.toLowerCase();
}

function safeLabelFor(element: Element): string | null {
  const explicit =
    element.getAttribute("aria-label") ||
    element.getAttribute("name") ||
    element.getAttribute("id") ||
    element.getAttribute("title") ||
    element.getAttribute("data-testid") ||
    element.getAttribute("data-test") ||
    element.getAttribute("data-cy");
  if (!explicit) return null;
  return explicit.trim().slice(0, 80) || null;
}

function makeEvent(
  partial: Omit<CaptureEvent, "id" | "timestamp" | "elapsed_ms" | "tab_id" | "url">,
): CaptureEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    elapsed_ms: Math.max(0, Date.now() - state.startedAtMs),
    tab_id: 0,
    url: location.href,
    ...partial,
  };
}

function emit(
  partial: Omit<CaptureEvent, "id" | "timestamp" | "elapsed_ms" | "tab_id" | "url">,
): void {
  if (!state.capturing) return;
  void chrome.runtime.sendMessage({ type: "FLOWWRIGHT_EVENT", event: makeEvent(partial) });
}

function recordNavigation(kind: string, fromUrl: string, toUrl: string): void {
  if (fromUrl === toUrl && kind !== "load") return;
  state.lastUrl = toUrl;
  emit({
    type: "navigation",
    selector: "window",
    element_role: null,
    label: kind,
    value_policy: "omitted",
    value: null,
    description: `${kind}: ${fromUrl} -> ${toUrl}`.slice(0, 500),
  });
}

function onClick(event: MouseEvent): void {
  if (!state.capturing || !(event.target instanceof Element) || isSensitiveField(event.target)) {
    return;
  }
  const selector = cssSelector(event.target);
  emit({
    type: "click",
    selector,
    element_role: roleFor(event.target),
    label: safeLabelFor(event.target),
    value_policy: "omitted",
    value: null,
    description: `click ${selector}`,
  });
}

function onInput(event: Event): void {
  if (!state.capturing || !(event.target instanceof Element)) return;
  const target = event.target;
  if (!isFormField(target) || isSensitiveField(target)) return;
  const selector = cssSelector(target);
  const existing = state.inputTimers.get(selector);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    emit({
      type: "input",
      selector,
      element_role: roleFor(target),
      label: safeLabelFor(target),
      value_policy: "masked",
      value: "***",
      description: `input ${selector}`,
    });
    state.inputTimers.delete(selector);
  }, INPUT_DEBOUNCE_MS);
  state.inputTimers.set(selector, timer);
}

function onSubmit(event: SubmitEvent): void {
  if (!state.capturing || !(event.target instanceof Element) || isSensitiveField(event.target)) {
    return;
  }
  const selector = cssSelector(event.target);
  emit({
    type: "submit",
    selector,
    element_role: roleFor(event.target),
    label: safeLabelFor(event.target),
    value_policy: "omitted",
    value: null,
    description: `submit ${selector}`,
  });
}

function installHistoryHooks(): void {
  if (!state.originalPushState) {
    state.originalPushState = history.pushState;
    history.pushState = function flowwrightPushState(...args) {
      const fromUrl = location.href;
      const result = state.originalPushState!.apply(this, args);
      recordNavigation("pushState", fromUrl, location.href);
      return result;
    };
  }
  if (!state.originalReplaceState) {
    state.originalReplaceState = history.replaceState;
    history.replaceState = function flowwrightReplaceState(...args) {
      const fromUrl = location.href;
      const result = state.originalReplaceState!.apply(this, args);
      recordNavigation("replaceState", fromUrl, location.href);
      return result;
    };
  }
}

function installListeners(): void {
  if (state.installed) return;
  state.installed = true;
  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("submit", onSubmit, true);
  window.addEventListener("popstate", () => {
    recordNavigation("popstate", state.lastUrl, location.href);
  });
  window.addEventListener("hashchange", () => {
    recordNavigation("hashchange", state.lastUrl, location.href);
  });
  installHistoryHooks();
}

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; session?: CaptureSession },
    _sender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (message.type === "FLOWWRIGHT_CONTENT_SYNC") {
      setCapturing(message.session ?? null);
      if (state.capturing) {
        recordNavigation("load", state.lastUrl, location.href);
      }
      sendResponse({ ok: true, installed: true });
    }
    return false;
  },
);

installListeners();
void chrome.runtime
  .sendMessage({ type: "FLOWWRIGHT_CONTENT_READY", url: location.href })
  .then((response: { session?: CaptureSession } | undefined) => {
    setCapturing(response?.session ?? null);
  })
  .catch(() => {
    // The extension context can disappear during reloads.
  });
