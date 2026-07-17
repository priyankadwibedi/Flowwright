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

let capturing = false;
let startedAtMs = 0;
let indicator: HTMLDivElement | null = null;

function ensureIndicator() {
  if (indicator || !document.documentElement) return;
  indicator = document.createElement("div");
  indicator.id = "flowwright-recording-indicator";
  indicator.textContent = "Flowwright recording";
  indicator.style.cssText =
    "position:fixed;z-index:2147483647;top:8px;right:8px;background:#111;color:#fff;padding:6px 10px;font:12px/1.2 sans-serif;border-radius:4px;opacity:0.85;pointer-events:none;";
  document.documentElement.appendChild(indicator);
}

function removeIndicator() {
  indicator?.remove();
  indicator = null;
}

function cssSelector(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const name = element.getAttribute("name");
  if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  return element.tagName.toLowerCase();
}

export function isSensitiveField(element: Element): boolean {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    )
  ) {
    return element.getAttribute("data-flowwright-sensitive") === "true";
  }
  const input = element as HTMLInputElement;
  return isSensitiveFieldLike({
    type: input.type,
    name: input.name,
    id: input.id,
    autocomplete: input.autocomplete,
    placeholder: input.placeholder,
    ariaLabel: input.getAttribute("aria-label") ?? undefined,
    dataFlowwrightSensitive: input.getAttribute("data-flowwright-sensitive"),
    dataSensitive: input.getAttribute("data-sensitive"),
  });
}

function labelFor(element: Element): string | null {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("name") ||
    element.textContent?.trim().slice(0, 40) ||
    null
  );
}

function emit(partial: Omit<CaptureEvent, "id" | "timestamp" | "elapsed_ms" | "tab_id" | "url">) {
  if (!capturing) return;
  const event: CaptureEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    elapsed_ms: Math.max(0, Date.now() - startedAtMs),
    tab_id: 0,
    url: location.href,
    ...partial,
  };
  void chrome.runtime.sendMessage({ type: "FLOWWRIGHT_EVENT", event });
}

function recordNavigation(description: string) {
  emit({
    type: "navigation",
    selector: "window",
    element_role: null,
    label: null,
    value_policy: "omitted",
    value: null,
    description,
  });
}

document.addEventListener(
  "click",
  (event) => {
    if (!capturing || !(event.target instanceof Element) || isSensitiveField(event.target)) return;
    emit({
      type: "click",
      selector: cssSelector(event.target),
      element_role: event.target.getAttribute("role"),
      label: labelFor(event.target),
      value_policy: "omitted",
      value: null,
      description: `click ${cssSelector(event.target)}`,
    });
  },
  true,
);

document.addEventListener(
  "input",
  (event) => {
    if (!capturing || !(event.target instanceof Element)) return;
    if (isSensitiveField(event.target)) {
      emit({
        type: "input",
        selector: cssSelector(event.target),
        element_role: event.target.getAttribute("role"),
        label: labelFor(event.target),
        value_policy: "omitted",
        value: null,
        description: "sensitive input omitted",
      });
      return;
    }
    const value =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        ? event.target.value.slice(0, 120)
        : null;
    emit({
      type: "input",
      selector: cssSelector(event.target),
      element_role: event.target.getAttribute("role"),
      label: labelFor(event.target),
      value_policy: value ? "masked" : "omitted",
      value: value ? "***" : null,
      description: `input ${cssSelector(event.target)}`,
    });
  },
  true,
);

document.addEventListener(
  "submit",
  (event) => {
    if (!capturing || !(event.target instanceof Element)) return;
    emit({
      type: "submit",
      selector: cssSelector(event.target),
      element_role: event.target.getAttribute("role"),
      label: labelFor(event.target),
      value_policy: "omitted",
      value: null,
      description: `submit ${cssSelector(event.target)}`,
    });
  },
  true,
);

const originalPushState = history.pushState.bind(history);
history.pushState = function pushState(...args) {
  const result = originalPushState(...args);
  if (capturing) recordNavigation(`pushState ${location.href}`);
  return result;
};
const originalReplaceState = history.replaceState.bind(history);
history.replaceState = function replaceState(...args) {
  const result = originalReplaceState(...args);
  if (capturing) recordNavigation(`replaceState ${location.href}`);
  return result;
};
window.addEventListener("popstate", () => {
  if (capturing) recordNavigation(`popstate ${location.href}`);
});
window.addEventListener("hashchange", () => {
  if (capturing) recordNavigation(`hashchange ${location.href}`);
});

chrome.runtime.onMessage.addListener((message: { type?: string; startedAt?: string }) => {
  if (message.type === "FLOWWRIGHT_CONTENT_START") {
    capturing = true;
    startedAtMs = message.startedAt ? Date.parse(message.startedAt) : Date.now();
    document.documentElement.dataset.flowwrightRecording = "true";
    ensureIndicator();
  }
  if (message.type === "FLOWWRIGHT_CONTENT_STOP") {
    capturing = false;
    delete document.documentElement.dataset.flowwrightRecording;
    removeIndicator();
  }
});

export const __test = { isSensitiveField, cssSelector };
