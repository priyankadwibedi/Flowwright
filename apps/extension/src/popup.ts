const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const state = document.querySelector<HTMLParagraphElement>("#state")!;

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "FLOWWRIGHT_GET_SESSION" });
  const recording = Boolean(response?.session?.recording);
  toggle.textContent = recording ? "Stop capture" : "Start capture";
  state.textContent = recording
    ? `Recording safe browser events… (${response.session.events?.length ?? 0} events)`
    : "Capture is off. Closing this popup does not stop an active session.";
}

toggle.addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!tabId) return;
  const current = await chrome.runtime.sendMessage({ type: "FLOWWRIGHT_GET_SESSION" });
  if (current?.session?.recording) {
    await chrome.runtime.sendMessage({ type: "FLOWWRIGHT_STOP" });
  } else {
    if (current?.session?.events?.length) {
      const confirmed = window.confirm(
        "Start a new recording? This clears the previous capture session.",
      );
      if (!confirmed) return;
    }
    const result = await chrome.runtime.sendMessage({
      type: "FLOWWRIGHT_START",
      tabId,
      confirmReset: true,
    });
    if (result?.error === "host_permission_denied") {
      state.textContent = "Host permission was denied for this tab.";
      return;
    }
  }
  await refresh();
});

document
  .querySelector<HTMLButtonElement>("#export")!
  .addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "FLOWWRIGHT_EXPORT" }, (response) => {
      const blob = new Blob([JSON.stringify(response?.events ?? [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: "flowwright-events.json",
        saveAs: true,
      });
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });

void refresh();
