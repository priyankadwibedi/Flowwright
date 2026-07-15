type SafeEvent = {
  timestamp: string;
  type: "click" | "navigation" | "input";
  description: string;
};
let capturing = false;
const events: SafeEvent[] = [];
function sensitive(element: Element) {
  const input = element as HTMLInputElement;
  const hint =
    `${input.type} ${input.name} ${input.autocomplete} ${input.getAttribute("aria-label") ?? ""}`.toLowerCase();
  return (
    input.type === "password" ||
    /card|cvv|cvc|secret|token|ssn|social security/.test(hint) ||
    element.getAttribute("data-sensitive") === "true"
  );
}
function description(element: Element) {
  const tag = element.tagName.toLowerCase();
  const label =
    element.getAttribute("aria-label") ||
    element.getAttribute("name") ||
    element.textContent?.trim().slice(0, 40) ||
    "unnamed";
  return `${tag}[${label.replace(/[\n\r]/g, " ")}]`;
}
document.addEventListener(
  "click",
  (event) => {
    if (
      capturing &&
      event.target instanceof Element &&
      !sensitive(event.target)
    )
      events.push({
        timestamp: new Date().toISOString(),
        type: "click",
        description: description(event.target),
      });
  },
  true,
);
document.addEventListener(
  "input",
  (event) => {
    if (
      capturing &&
      event.target instanceof Element &&
      !sensitive(event.target)
    )
      events.push({
        timestamp: new Date().toISOString(),
        type: "input",
        description: description(event.target),
      });
  },
  true,
);
window.addEventListener("popstate", () => {
  if (capturing)
    events.push({
      timestamp: new Date().toISOString(),
      type: "navigation",
      description: location.pathname,
    });
});
chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === "FLOWWRIGHT_START") {
    capturing = true;
    document.documentElement.dataset.flowwrightRecording = "true";
  }
  if (message.type === "FLOWWRIGHT_STOP") {
    capturing = false;
    delete document.documentElement.dataset.flowwrightRecording;
    chrome.storage.local.set({ events });
  }
});
